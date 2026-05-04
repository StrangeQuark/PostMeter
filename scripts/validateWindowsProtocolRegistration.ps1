param(
  [string]$ReleaseDir = "release",
  [int]$MaxInstallAttempts = 2
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

function New-ProtocolInstallDirectory {
  return Join-Path $env:TEMP ("PostMeterProtocolTest-" + [guid]::NewGuid().ToString("N"))
}

function Format-InstallerExitCode {
  param([int]$ExitCode)
  $hex = [System.BitConverter]::ToUInt32([System.BitConverter]::GetBytes([int]$ExitCode), 0).ToString("X8")
  return "$ExitCode (0x$hex)"
}

function Write-InstallerSnapshot {
  param([System.IO.FileInfo]$Installer)
  $hash = Get-FileHash -Algorithm SHA256 -Path $Installer.FullName
  Write-Host "Windows installer snapshot: name=$($Installer.Name) size=$($Installer.Length) sha256=$($hash.Hash)"
}

function Write-RecentApplicationErrorEvents {
  param([datetime]$Since)
  try {
    $events = Get-WinEvent -FilterHashtable @{ LogName = "Application"; StartTime = $Since } -MaxEvents 20 -ErrorAction Stop |
      Where-Object {
        $_.ProviderName -match "Application Error|Windows Error Reporting" -or
        $_.Message -match "PostMeter|Setup|NSIS"
      } |
      Select-Object -First 8
    foreach ($event in $events) {
      $message = (($event.Message -replace "`r?`n", " ") -replace "\s+", " ").Trim()
      Write-Host "Recent application error event: time=$($event.TimeCreated) provider=$($event.ProviderName) id=$($event.Id) message=$message"
    }
  } catch {
    Write-Warning "Unable to read recent Windows application error events: $($_.Exception.Message)"
  }
}

function Install-PostMeter {
  param(
    [System.IO.FileInfo]$Installer,
    [string]$InstallDir,
    [int]$Attempt,
    [int]$MaxAttempts
  )
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  Stop-PostMeterProcesses
  $arguments = @("/S", "/D=$InstallDir")
  $startTime = Get-Date
  Write-Host "Installing $($Installer.Name) into $InstallDir for Windows protocol validation. Attempt $Attempt of $MaxAttempts."
  $install = Start-Process -FilePath $Installer.FullName -ArgumentList $arguments -WorkingDirectory $Installer.DirectoryName -PassThru -Wait
  if ($install.ExitCode -ne 0) {
    Write-RecentApplicationErrorEvents -Since $startTime.AddSeconds(-5)
    throw "PostMeter installer exited with $(Format-InstallerExitCode -ExitCode $install.ExitCode)."
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
$installDir = $null
$maxAttempts = [Math]::Max(1, $MaxInstallAttempts)

try {
  Write-InstallerSnapshot -Installer $installer
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $installDir = New-ProtocolInstallDirectory
    try {
      Install-PostMeter -Installer $installer -InstallDir $installDir -Attempt $attempt -MaxAttempts $maxAttempts
      break
    } catch {
      $failure = $_
      Stop-PostMeterProcesses
      $uninstaller = Find-Uninstaller -Directory $installDir
      if ($uninstaller) {
        Start-Process -FilePath $uninstaller.FullName -ArgumentList "/S" -Wait -ErrorAction SilentlyContinue
      }
      Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue
      if ($attempt -ge $maxAttempts) {
        throw $failure
      }
      Write-Warning "Windows installer attempt $attempt failed: $($failure.Exception.Message). Retrying with a fresh install directory."
      Start-Sleep -Seconds (2 * $attempt)
    }
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
  if ($installDir) {
    $uninstaller = Find-Uninstaller -Directory $installDir
    if ($uninstaller) {
      Start-Process -FilePath $uninstaller.FullName -ArgumentList "/S" -Wait -ErrorAction SilentlyContinue
    }
    Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue
  }
  if ($ProtocolTranscriptStarted) {
    Stop-Transcript | Out-Null
  }
}
