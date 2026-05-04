param(
  [string]$ReleaseDir = "release"
)

$ErrorActionPreference = "Stop"
$ProtocolTranscriptStarted = $false

if ($env:POSTMETER_VALIDATION_ARTIFACT_DIR) {
  try {
    New-Item -ItemType Directory -Path $env:POSTMETER_VALIDATION_ARTIFACT_DIR -Force | Out-Null
    $protocolLogPath = Join-Path $env:POSTMETER_VALIDATION_ARTIFACT_DIR "windows-protocol-validation.log"
    Start-Transcript -Path $protocolLogPath -Append | Out-Null
    $ProtocolTranscriptStarted = $true
  } catch {
    Write-Warning "Unable to start Windows protocol validation transcript: $($_.Exception.Message)"
  }
}

function Find-Installer {
  param([string]$Directory)
  $installer = Get-ChildItem -Path $Directory -Filter "*.exe" -File |
    Where-Object { $_.Name -match "PostMeter|Setup" } |
    Sort-Object Length -Descending |
    Select-Object -First 1
  if (-not $installer) {
    throw "No Windows installer .exe found in $Directory."
  }
  return $installer
}

function Read-DefaultValue {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    return $null
  }
  return (Get-Item -Path $Path).GetValue("")
}

function Test-ProtocolCommand {
  param([string]$ExpectedInstallDir)
  $commandPaths = @(
    "Registry::HKEY_CURRENT_USER\Software\Classes\postmeter\shell\open\command",
    "Registry::HKEY_LOCAL_MACHINE\Software\Classes\postmeter\shell\open\command",
    "Registry::HKEY_CLASSES_ROOT\postmeter\shell\open\command"
  )

  foreach ($commandPath in $commandPaths) {
    $command = Read-DefaultValue -Path $commandPath
    $matchesExpectedInstall = $false
    if ($command) {
      $matchesExpectedInstall = $command.IndexOf($ExpectedInstallDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    }
    if ($command -and $command -match "PostMeter" -and $command -match "%1" -and $matchesExpectedInstall) {
      return $true
    }
  }
  return $false
}

function Write-ProtocolRegistrySnapshot {
  param([string]$ExpectedInstallDir)
  $rootPaths = @(
    "Registry::HKEY_CURRENT_USER\Software\Classes\postmeter",
    "Registry::HKEY_LOCAL_MACHINE\Software\Classes\postmeter",
    "Registry::HKEY_CLASSES_ROOT\postmeter"
  )
  $commandPaths = @(
    "Registry::HKEY_CURRENT_USER\Software\Classes\postmeter\shell\open\command",
    "Registry::HKEY_LOCAL_MACHINE\Software\Classes\postmeter\shell\open\command",
    "Registry::HKEY_CLASSES_ROOT\postmeter\shell\open\command"
  )

  foreach ($rootPath in $rootPaths) {
    $exists = Test-Path $rootPath
    $defaultValue = ""
    $hasUrlProtocol = $false
    if ($exists) {
      $item = Get-Item -Path $rootPath
      $defaultValue = [string]$item.GetValue("")
      $hasUrlProtocol = $null -ne $item.GetValue("URL Protocol")
    }
    Write-Host "Protocol root snapshot: path=$rootPath exists=$exists default=$defaultValue urlProtocol=$hasUrlProtocol"
  }

  foreach ($commandPath in $commandPaths) {
    $command = Read-DefaultValue -Path $commandPath
    $matchesExpectedInstall = $false
    $hasPercentArg = $false
    if ($command) {
      $matchesExpectedInstall = $command.IndexOf($ExpectedInstallDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
      $hasPercentArg = $command -match "%1"
    }
    Write-Host "Protocol command snapshot: path=$commandPath exists=$($null -ne $command) matchesInstall=$matchesExpectedInstall hasPercentArg=$hasPercentArg"
  }
}

function Stop-PostMeterProcesses {
  Get-Process -Name "PostMeter" -ErrorAction SilentlyContinue |
    ForEach-Object {
      try {
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
      } catch {
      }
    }
}

function Test-ProtocolLaunch {
  param([string]$ExpectedInstallDir)
  Stop-PostMeterProcesses
  $url = "postmeter://oauth/callback?code=release-validation&state=release-validation"
  Start-Process -FilePath $url

  $deadline = (Get-Date).AddSeconds(20)
  do {
    Start-Sleep -Milliseconds 500
    $process = Get-Process -Name "PostMeter" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($process) {
      $processPath = ""
      try {
        $processPath = $process.Path
      } catch {
        $processPath = ""
      }
      if ($processPath -and $processPath.IndexOf($ExpectedInstallDir, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
        Stop-PostMeterProcesses
        return $false
      }
      Stop-PostMeterProcesses
      return $true
    }
  } while ((Get-Date) -lt $deadline)

  Stop-PostMeterProcesses
  return $false
}

function Find-Uninstaller {
  param([string]$Directory)
  return Get-ChildItem -Path $Directory -Filter "Uninstall*.exe" -File -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

function Test-ProtocolRoot {
  $rootPaths = @(
    "Registry::HKEY_CURRENT_USER\Software\Classes\postmeter",
    "Registry::HKEY_LOCAL_MACHINE\Software\Classes\postmeter",
    "Registry::HKEY_CLASSES_ROOT\postmeter"
  )

  foreach ($rootPath in $rootPaths) {
    if (-not (Test-Path $rootPath)) {
      continue
    }
    $item = Get-Item -Path $rootPath
    $protocolValue = $item.GetValue("URL Protocol")
    $defaultValue = $item.GetValue("")
    if ($null -ne $protocolValue -and "$defaultValue" -match "URL:postmeter") {
      return $true
    }
  }
  return $false
}

$releasePath = Resolve-Path $ReleaseDir
$installer = Find-Installer -Directory $releasePath
$installDir = Join-Path $env:TEMP ("PostMeterProtocolTest-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $installDir | Out-Null

try {
  $arguments = @("/S", "/D=$installDir")
  Write-Host "Installing $($installer.Name) into $installDir for Windows protocol validation."
  $install = Start-Process -FilePath $installer.FullName -ArgumentList $arguments -PassThru -Wait
  if ($install.ExitCode -ne 0) {
    throw "PostMeter installer exited with $($install.ExitCode)."
  }
  Write-ProtocolRegistrySnapshot -ExpectedInstallDir $installDir

  if (-not (Test-ProtocolRoot)) {
    throw "postmeter protocol root registry key was not registered."
  }
  if (-not (Test-ProtocolCommand -ExpectedInstallDir $installDir)) {
    throw "postmeter protocol open command was not registered with this PostMeter install and %1."
  }
  if (-not (Test-ProtocolLaunch -ExpectedInstallDir $installDir)) {
    throw "postmeter:// protocol launch did not start this PostMeter install through ShellExecute."
  }
  if (-not (Find-Uninstaller -Directory $installDir)) {
    throw "PostMeter installer did not create an uninstaller in $installDir."
  }

  Write-Host "Validated Windows postmeter:// protocol registration and launch from $($installer.Name)."
} finally {
  Stop-PostMeterProcesses
  $uninstaller = Find-Uninstaller -Directory $installDir
  if ($uninstaller) {
    Start-Process -FilePath $uninstaller.FullName -ArgumentList "/S" -Wait -ErrorAction SilentlyContinue
  }
  Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue
  if ($ProtocolTranscriptStarted) {
    Stop-Transcript | Out-Null
  }
}
