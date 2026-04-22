param(
  [string]$ReleaseDir = "release"
)

$ErrorActionPreference = "Stop"

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
  $commandPaths = @(
    "Registry::HKEY_CURRENT_USER\Software\Classes\postmeter\shell\open\command",
    "Registry::HKEY_LOCAL_MACHINE\Software\Classes\postmeter\shell\open\command",
    "Registry::HKEY_CLASSES_ROOT\postmeter\shell\open\command"
  )

  foreach ($commandPath in $commandPaths) {
    $command = Read-DefaultValue -Path $commandPath
    if ($command -and $command -match "PostMeter" -and $command -match "%1") {
      return $true
    }
  }
  return $false
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
  $install = Start-Process -FilePath $installer.FullName -ArgumentList $arguments -PassThru -Wait
  if ($install.ExitCode -ne 0) {
    throw "PostMeter installer exited with $($install.ExitCode)."
  }

  if (-not (Test-ProtocolRoot)) {
    throw "postmeter protocol root registry key was not registered."
  }
  if (-not (Test-ProtocolCommand)) {
    throw "postmeter protocol open command was not registered with PostMeter and %1."
  }

  Write-Host "Validated Windows postmeter:// protocol registration from $($installer.Name)."
} finally {
  $uninstaller = Get-ChildItem -Path $installDir -Filter "Uninstall*.exe" -File -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($uninstaller) {
    Start-Process -FilePath $uninstaller.FullName -ArgumentList "/S" -Wait -ErrorAction SilentlyContinue
  }
  Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue
}
