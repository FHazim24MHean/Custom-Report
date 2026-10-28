[CmdletBinding()]
param(
  [string]$InstallRoot = (Join-Path $env:ProgramData "CustomReportGenerator"),
  [string]$ApiOrigin = "http://gridvisdemo.site:8080",
  [switch]$OpenFirewall
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "service-common.ps1")
$Port = 8081

Assert-Administrator
$InstallRoot = Assert-SafeInstallRoot $InstallRoot
$parsedApiOrigin = $null
if (-not [Uri]::TryCreate($ApiOrigin, [UriKind]::Absolute, [ref]$parsedApiOrigin) -or
    $parsedApiOrigin.Scheme -notin @("http", "https") -or
    -not $parsedApiOrigin.Host) {
  throw 'ApiOrigin must be a plain absolute URL such as "http://192.228.0.135:8080". Do not paste Markdown link syntax.'
}
$ApiOrigin = $ApiOrigin.TrimEnd('/')
$payloadRoot = Join-Path $PSScriptRoot "payload"
$serviceExecutableSource = Join-Path $PSScriptRoot "CustomReportService.exe"
$serviceConfigSource = Join-Path $PSScriptRoot "CustomReportService.xml"

foreach ($requiredPath in @(
    (Join-Path $payloadRoot "app\server.js"),
    (Join-Path $payloadRoot "runtime\node.exe"),
    (Join-Path $PSScriptRoot "hash-password.js"),
    $serviceExecutableSource,
    $serviceConfigSource
  )) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Service package is incomplete. Missing: $requiredPath"
  }
}

if (Get-Service -Name $script:ServiceName -ErrorAction SilentlyContinue) {
  throw "Service $($script:ServiceName) is already installed. Use update-service.ps1 for an existing installation."
}

$packageNode = Join-Path $payloadRoot "runtime\node.exe"
foreach ($scriptPath in @(
    (Join-Path $payloadRoot "app\server.js"),
    (Join-Path $payloadRoot "app\app.mjs")
  )) {
  & $packageNode --check $scriptPath
  if ($LASTEXITCODE -ne 0) {
    throw "Service package validation failed for $scriptPath. Extract a fresh copy of the package and retry."
  }
}

New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
foreach ($directory in @("app", "runtime", "config", "data", "logs", "backups", "scripts")) {
  New-Item -ItemType Directory -Path (Join-Path $InstallRoot $directory) -Force | Out-Null
}

Copy-Item -Path (Join-Path $payloadRoot "app\*") -Destination (Join-Path $InstallRoot "app") -Recurse -Force
Copy-Item -Path (Join-Path $payloadRoot "runtime\*") -Destination (Join-Path $InstallRoot "runtime") -Recurse -Force
Copy-Item -LiteralPath $serviceExecutableSource -Destination (Join-Path $InstallRoot "CustomReportService.exe") -Force
Copy-Item -LiteralPath $serviceConfigSource -Destination (Join-Path $InstallRoot "CustomReportService.xml") -Force
foreach ($scriptName in @("status-service.ps1", "uninstall-service.ps1")) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $scriptName) -Destination (Join-Path $InstallRoot "scripts") -Force
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "service-common.ps1") -Destination (Join-Path $InstallRoot "scripts\service-common.ps1") -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "hash-password.js") -Destination (Join-Path $InstallRoot "scripts\hash-password.js") -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "set-report-password.ps1") -Destination (Join-Path $InstallRoot "scripts\set-report-password.ps1") -Force

$environmentFile = Join-Path $InstallRoot "config\service.env"
if (-not (Test-Path -LiteralPath $environmentFile)) {
  $metadataPath = Join-Path $InstallRoot "data\app-metadata.json"
  $environmentTemplate = Get-Content -LiteralPath (Join-Path $PSScriptRoot "service.env.example") -Raw
  $environmentContent = $environmentTemplate.Replace("__PORT__", [string]$Port)
  $environmentContent = $environmentContent.Replace("__API_ORIGIN__", $ApiOrigin)
  $environmentContent = $environmentContent.Replace("__APP_METADATA_PATH__", $metadataPath)
  $environmentContent = $environmentContent.Replace("__REPORT_USERNAME__", "")
  $environmentContent = $environmentContent.Replace("__REPORT_PASSWORD_HASH__", "")
  Write-Utf8FileWithoutBom -Path $environmentFile -Content $environmentContent
} else {
  # A retry after a partial installation must honor the current command arguments.
  $environmentContent = Get-Content -LiteralPath $environmentFile -Raw
  if ($environmentContent -match '(?m)^PORT=') {
    $environmentContent = [regex]::Replace($environmentContent, '(?m)^PORT=.*$', "PORT=$Port")
  } else {
    $environmentContent = "PORT=$Port`n$environmentContent"
  }
  if ($environmentContent -match '(?m)^API_ORIGIN=') {
    $environmentContent = [regex]::Replace($environmentContent, '(?m)^API_ORIGIN=.*$', "API_ORIGIN=$ApiOrigin")
  } else {
    $environmentContent += "`nAPI_ORIGIN=$ApiOrigin`n"
  }
  Write-Utf8FileWithoutBom -Path $environmentFile -Content $environmentContent
}

if (-not ((Get-Content -LiteralPath $environmentFile -Raw) -match '(?m)^REPORT_USERNAME=.+$' -and
    (Get-Content -LiteralPath $environmentFile -Raw) -match '(?m)^REPORT_PASSWORD_HASH=scrypt:[a-f0-9]{32}:[a-f0-9]{128}$')) {
  Set-ReportLoginCredential `
    -EnvironmentFile $environmentFile `
    -NodePath (Join-Path $InstallRoot "runtime\node.exe") `
    -HashScript (Join-Path $InstallRoot "scripts\hash-password.js")
}

Set-ServiceDirectoryPermissions -InstallRoot $InstallRoot

$serviceExecutable = Join-Path $InstallRoot "CustomReportService.exe"
$configuredPort = Get-ConfiguredPort -EnvironmentFile $environmentFile
$serviceInstalledByThisRun = $false
try {
  & $serviceExecutable install
  if ($LASTEXITCODE -ne 0) {
    throw "WinSW failed to install the service (exit code $LASTEXITCODE)."
  }
  $serviceInstalledByThisRun = $true

  & $serviceExecutable start
  if ($LASTEXITCODE -ne 0) {
    throw "WinSW failed to start the service (exit code $LASTEXITCODE)."
  }

  Wait-ServiceHealthy -Port $configuredPort | Out-Null
} catch {
  $installError = $_.Exception.Message
  if ($serviceInstalledByThisRun -or (Get-Service -Name $script:ServiceName -ErrorAction SilentlyContinue)) {
    try { & $serviceExecutable stop | Out-Null } catch { }
    try { & $serviceExecutable uninstall | Out-Null } catch { }
  }
  $logDirectory = Join-Path $InstallRoot "logs"
  throw "Installation failed and the new service registration was rolled back. Review $logDirectory, then retry. Original error: $installError"
}

if ($OpenFirewall) {
  $ruleName = "Custom Report Generator TCP $configuredPort"
  try {
    if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
      New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $configuredPort -Profile Domain,Private | Out-Null
    }
  } catch {
    Write-Warning "The service is healthy, but the firewall rule could not be created: $($_.Exception.Message)"
  }
}

Write-Host "Service installed and healthy."
Write-Host "Local URL: http://127.0.0.1`:$configuredPort"
Write-Host "Network URL: http://<report-server-IP-or-DNS-name>`:$configuredPort"
Write-Host "Configuration: $environmentFile"
