#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif

#include <windows.h>
#include <aclapi.h>
#include <sddl.h>
#include <userenv.h>

#include <algorithm>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

namespace {

constexpr const wchar_t* kDefaultProfileName = L"PostMeter.ScriptWorkerSandbox";

struct Options {
  std::wstring profileName = kDefaultProfileName;
  std::wstring tempDir;
  std::vector<std::wstring> readOnlyPaths;
  std::vector<std::wstring> environment;
  std::wstring executablePath;
  std::vector<std::wstring> childArgs;
};

struct SidDeleter {
  void operator()(PSID sid) const {
    if (sid) {
      FreeSid(sid);
    }
  }
};

struct LocalDeleter {
  void operator()(void* value) const {
    if (value) {
      LocalFree(value);
    }
  }
};

using UniqueSid = std::unique_ptr<void, SidDeleter>;
using UniqueLocal = std::unique_ptr<void, LocalDeleter>;

std::wstring lastErrorMessage(const std::wstring& prefix, DWORD code = GetLastError()) {
  LPWSTR message = nullptr;
  FormatMessageW(
    FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
    nullptr,
    code,
    MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
    reinterpret_cast<LPWSTR>(&message),
    0,
    nullptr
  );
  std::wstringstream stream;
  stream << prefix << L" failed with " << code;
  if (message) {
    stream << L": " << message;
    LocalFree(message);
  }
  return stream.str();
}

[[noreturn]] void fail(const std::wstring& message) {
  std::wcerr << L"PostMeter Windows sandbox helper: " << message << std::endl;
  ExitProcess(1);
}

bool startsWith(const std::wstring& value, const std::wstring& prefix) {
  return value.rfind(prefix, 0) == 0;
}

std::wstring quoteArg(const std::wstring& value) {
  if (value.empty()) {
    return L"\"\"";
  }
  bool needsQuotes = false;
  for (wchar_t ch : value) {
    if (ch == L' ' || ch == L'\t' || ch == L'\n' || ch == L'\v' || ch == L'"') {
      needsQuotes = true;
      break;
    }
  }
  if (!needsQuotes) {
    return value;
  }

  std::wstring output = L"\"";
  size_t backslashes = 0;
  for (wchar_t ch : value) {
    if (ch == L'\\') {
      backslashes++;
      continue;
    }
    if (ch == L'"') {
      output.append(backslashes * 2 + 1, L'\\');
      output.push_back(ch);
      backslashes = 0;
      continue;
    }
    output.append(backslashes, L'\\');
    backslashes = 0;
    output.push_back(ch);
  }
  output.append(backslashes * 2, L'\\');
  output.push_back(L'"');
  return output;
}

std::wstring childCommandLine(const Options& options) {
  std::wstring commandLine = quoteArg(options.executablePath);
  for (const auto& arg : options.childArgs) {
    commandLine.push_back(L' ');
    commandLine.append(quoteArg(arg));
  }
  return commandLine;
}

std::vector<wchar_t> environmentBlock(std::vector<std::wstring> entries) {
  entries.erase(std::remove_if(entries.begin(), entries.end(), [](const std::wstring& entry) {
    const size_t separator = entry.find(L'=');
    return separator == std::wstring::npos || separator == 0;
  }), entries.end());
  std::sort(entries.begin(), entries.end(), [](const std::wstring& left, const std::wstring& right) {
    return _wcsicmp(left.c_str(), right.c_str()) < 0;
  });

  std::vector<wchar_t> block;
  for (const auto& entry : entries) {
    block.insert(block.end(), entry.begin(), entry.end());
    block.push_back(L'\0');
  }
  block.push_back(L'\0');
  return block;
}

DWORD fileAttributesOrFail(const std::wstring& path) {
  const DWORD attributes = GetFileAttributesW(path.c_str());
  if (attributes == INVALID_FILE_ATTRIBUTES) {
    fail(lastErrorMessage(L"GetFileAttributesW(" + path + L")"));
  }
  return attributes;
}

void ensureDirectory(const std::wstring& path) {
  if (path.empty()) {
    fail(L"private temp directory was not provided");
  }
  const DWORD attributes = GetFileAttributesW(path.c_str());
  if (attributes != INVALID_FILE_ATTRIBUTES) {
    if ((attributes & FILE_ATTRIBUTE_DIRECTORY) == 0) {
      fail(L"private temp path is not a directory: " + path);
    }
    return;
  }
  if (!CreateDirectoryW(path.c_str(), nullptr) && GetLastError() != ERROR_ALREADY_EXISTS) {
    fail(lastErrorMessage(L"CreateDirectoryW(" + path + L")"));
  }
}

void grantPathAccess(const std::wstring& path, PSID sid, DWORD permissions) {
  const DWORD attributes = fileAttributesOrFail(path);
  const bool isDirectory = (attributes & FILE_ATTRIBUTE_DIRECTORY) != 0;

  PACL oldDacl = nullptr;
  PSECURITY_DESCRIPTOR securityDescriptor = nullptr;
  DWORD result = GetNamedSecurityInfoW(
    const_cast<LPWSTR>(path.c_str()),
    SE_FILE_OBJECT,
    DACL_SECURITY_INFORMATION,
    nullptr,
    nullptr,
    &oldDacl,
    nullptr,
    &securityDescriptor
  );
  UniqueLocal securityDescriptorOwner(securityDescriptor);
  if (result != ERROR_SUCCESS) {
    fail(lastErrorMessage(L"GetNamedSecurityInfoW(" + path + L")", result));
  }

  EXPLICIT_ACCESSW access{};
  access.grfAccessPermissions = permissions;
  access.grfAccessMode = GRANT_ACCESS;
  access.grfInheritance = isDirectory
    ? static_cast<DWORD>(OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE)
    : NO_INHERITANCE;
  access.Trustee.TrusteeForm = TRUSTEE_IS_SID;
  access.Trustee.TrusteeType = TRUSTEE_IS_USER;
  access.Trustee.ptstrName = static_cast<LPWSTR>(sid);

  PACL newDacl = nullptr;
  result = SetEntriesInAclW(1, &access, oldDacl, &newDacl);
  UniqueLocal newDaclOwner(newDacl);
  if (result != ERROR_SUCCESS) {
    fail(lastErrorMessage(L"SetEntriesInAclW(" + path + L")", result));
  }

  result = SetNamedSecurityInfoW(
    const_cast<LPWSTR>(path.c_str()),
    SE_FILE_OBJECT,
    DACL_SECURITY_INFORMATION,
    nullptr,
    nullptr,
    newDacl,
    nullptr
  );
  if (result != ERROR_SUCCESS) {
    fail(lastErrorMessage(L"SetNamedSecurityInfoW(" + path + L")", result));
  }
}

UniqueSid appContainerSid(const std::wstring& profileName) {
  PSID sid = nullptr;
  HRESULT hr = CreateAppContainerProfile(
    profileName.c_str(),
    L"PostMeter Script Worker Sandbox",
    L"Restricts untrusted Postman-compatible script workers launched by PostMeter.",
    nullptr,
    0,
    &sid
  );
  if (hr == HRESULT_FROM_WIN32(ERROR_ALREADY_EXISTS)) {
    hr = DeriveAppContainerSidFromAppContainerName(profileName.c_str(), &sid);
  }
  if (FAILED(hr)) {
    std::wstringstream stream;
    stream << L"CreateAppContainerProfile(" << profileName << L") failed with HRESULT 0x" << std::hex << hr;
    fail(stream.str());
  }
  return UniqueSid(sid);
}

HANDLE createKillOnCloseJob() {
  HANDLE job = CreateJobObjectW(nullptr, nullptr);
  if (!job) {
    fail(lastErrorMessage(L"CreateJobObjectW"));
  }

  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_ACTIVE_PROCESS;
  limits.BasicLimitInformation.ActiveProcessLimit = 1;
  if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) {
    CloseHandle(job);
    fail(lastErrorMessage(L"SetInformationJobObject"));
  }
  return job;
}

std::vector<HANDLE> inheritedStandardHandles() {
  std::vector<HANDLE> handles;
  for (DWORD id : { STD_INPUT_HANDLE, STD_OUTPUT_HANDLE, STD_ERROR_HANDLE }) {
    HANDLE handle = GetStdHandle(id);
    if (handle && handle != INVALID_HANDLE_VALUE) {
      handles.push_back(handle);
    }
  }
  return handles;
}

DWORD runSandboxed(const Options& options, PSID sid) {
  SECURITY_CAPABILITIES capabilities{};
  capabilities.AppContainerSid = sid;
  capabilities.CapabilityCount = 0;
  capabilities.Capabilities = nullptr;

  auto handles = inheritedStandardHandles();
  SIZE_T attributeListSize = 0;
  InitializeProcThreadAttributeList(nullptr, 2, 0, &attributeListSize);
  std::vector<unsigned char> attributeBuffer(attributeListSize);
  auto attributeList = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(attributeBuffer.data());
  if (!InitializeProcThreadAttributeList(attributeList, 2, 0, &attributeListSize)) {
    fail(lastErrorMessage(L"InitializeProcThreadAttributeList"));
  }

  if (!UpdateProcThreadAttribute(
    attributeList,
    0,
    PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES,
    &capabilities,
    sizeof(capabilities),
    nullptr,
    nullptr
  )) {
    DeleteProcThreadAttributeList(attributeList);
    fail(lastErrorMessage(L"UpdateProcThreadAttribute(SECURITY_CAPABILITIES)"));
  }

  if (!handles.empty() && !UpdateProcThreadAttribute(
    attributeList,
    0,
    PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
    handles.data(),
    handles.size() * sizeof(HANDLE),
    nullptr,
    nullptr
  )) {
    DeleteProcThreadAttributeList(attributeList);
    fail(lastErrorMessage(L"UpdateProcThreadAttribute(HANDLE_LIST)"));
  }

  STARTUPINFOEXW startupInfo{};
  startupInfo.StartupInfo.cb = sizeof(startupInfo);
  startupInfo.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
  startupInfo.StartupInfo.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
  startupInfo.StartupInfo.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
  startupInfo.StartupInfo.hStdError = GetStdHandle(STD_ERROR_HANDLE);
  startupInfo.lpAttributeList = attributeList;

  std::wstring commandLineText = childCommandLine(options);
  std::vector<wchar_t> commandLine(commandLineText.begin(), commandLineText.end());
  commandLine.push_back(L'\0');
  std::vector<wchar_t> envBlock = environmentBlock(options.environment);

  HANDLE job = createKillOnCloseJob();
  PROCESS_INFORMATION processInfo{};
  DWORD creationFlags = EXTENDED_STARTUPINFO_PRESENT
    | CREATE_UNICODE_ENVIRONMENT
    | CREATE_SUSPENDED
    | CREATE_NO_WINDOW;
  BOOL created = CreateProcessW(
    options.executablePath.c_str(),
    commandLine.data(),
    nullptr,
    nullptr,
    !handles.empty(),
    creationFlags,
    envBlock.data(),
    options.tempDir.c_str(),
    &startupInfo.StartupInfo,
    &processInfo
  );
  DeleteProcThreadAttributeList(attributeList);
  if (!created) {
    CloseHandle(job);
    fail(lastErrorMessage(L"CreateProcessW(" + options.executablePath + L")"));
  }

  if (!AssignProcessToJobObject(job, processInfo.hProcess)) {
    TerminateProcess(processInfo.hProcess, 1);
    CloseHandle(processInfo.hThread);
    CloseHandle(processInfo.hProcess);
    CloseHandle(job);
    fail(lastErrorMessage(L"AssignProcessToJobObject"));
  }

  ResumeThread(processInfo.hThread);
  WaitForSingleObject(processInfo.hProcess, INFINITE);

  DWORD exitCode = 1;
  GetExitCodeProcess(processInfo.hProcess, &exitCode);
  CloseHandle(processInfo.hThread);
  CloseHandle(processInfo.hProcess);
  CloseHandle(job);
  return exitCode;
}

Options parseOptions(int argc, wchar_t* argv[]) {
  Options options;
  int index = 1;
  for (; index < argc; ++index) {
    std::wstring arg = argv[index];
    if (arg == L"--") {
      ++index;
      break;
    }
    auto needValue = [&](const wchar_t* name) -> std::wstring {
      if (index + 1 >= argc) {
        fail(std::wstring(L"missing value for ") + name);
      }
      return argv[++index];
    };
    if (arg == L"--profile") {
      options.profileName = needValue(L"--profile");
    } else if (arg == L"--temp") {
      options.tempDir = needValue(L"--temp");
    } else if (arg == L"--read-only") {
      options.readOnlyPaths.push_back(needValue(L"--read-only"));
    } else if (arg == L"--env") {
      options.environment.push_back(needValue(L"--env"));
    } else if (arg == L"--validate-helper") {
      std::wcout << L"PostMeter Windows sandbox helper available." << std::endl;
      ExitProcess(0);
    } else {
      fail(L"unknown argument: " + arg);
    }
  }

  if (index >= argc) {
    fail(L"child executable path was not provided");
  }
  options.executablePath = argv[index++];
  for (; index < argc; ++index) {
    options.childArgs.push_back(argv[index]);
  }
  if (options.profileName.empty() || startsWith(options.profileName, L"-")) {
    fail(L"invalid AppContainer profile name");
  }
  return options;
}

} // namespace

int wmain(int argc, wchar_t* argv[]) {
  Options options = parseOptions(argc, argv);
  ensureDirectory(options.tempDir);

  UniqueSid sid = appContainerSid(options.profileName);
  grantPathAccess(options.tempDir, sid.get(), FILE_GENERIC_READ | FILE_GENERIC_WRITE | FILE_GENERIC_EXECUTE | DELETE);
  grantPathAccess(options.executablePath, sid.get(), FILE_GENERIC_READ | FILE_GENERIC_EXECUTE);
  for (const auto& readOnlyPath : options.readOnlyPaths) {
    grantPathAccess(readOnlyPath, sid.get(), FILE_GENERIC_READ | FILE_GENERIC_EXECUTE);
  }

  DWORD exitCode = runSandboxed(options, sid.get());
  return static_cast<int>(exitCode);
}
