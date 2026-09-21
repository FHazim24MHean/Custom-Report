[CmdletBinding()]
param(
  [string]$InstallRoot = (Join-Path $env:ProgramData "CustomReportGenerator"),
  [string]$ApiOrigin = "http://gridvisdemo.site:8080",
  [ValidateRange(1, 65535)][int]$Port = 5500,
  [switch]$OpenFirewall
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "service-common.ps1")

Assert-Administrator
$InstallRoot = Assert-SafeInstallRoot $InstallRoot
$payloadRoot = Join-Path $PSScriptRoot "payload"
$serviceExecutableSource = Join-Path $PSScriptRoot "CustomReportService.exe"
$serviceConfigSource = Join-Path $PSScriptRoot "CustomReportService.xml"

foreach ($requiredPath in @(
    (Join-Path $payloadRoot "app\server.js"),
    (Join-Path $payloadRoot "runtime\node.exe"),
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

$environmentFile = Join-Path $InstallRoot "config\service.env"
if (-not (Test-Path -LiteralPath $environmentFile)) {
  $metadataPath = Join-Path $InstallRoot "data\app-metadata.json"
  $environmentTemplate = Get-Content -LiteralPath (Join-Path $PSScriptRoot "service.env.example") -Raw
  $environmentContent = $environmentTemplate
    .Replace("__PORT__", [string]$Port)
    .Replace("__API_ORIGIN__", $ApiOrigin.TrimEnd('/'))
    .Replace("__APP_METADATA_PATH__", $metadataPath)
  Write-Utf8FileWithoutBom -Path $environmentFile -Content $environmentContent
}

Set-ServiceDirectoryPermissions -InstallRoot $InstallRoot

$serviceExecutable = Join-Path $InstallRoot "CustomReportService.exe"
& $serviceExecutable install
if ($LASTEXITCODE -ne 0) {
  throw "WinSW failed to install the service (exit code $LASTEXITCODE)."
}
& $serviceExecutable start
if ($LASTEXITCODE -ne 0) {
  throw "WinSW failed to start the service (exit code $LASTEXITCODE)."
}

$configuredPort = Get-ConfiguredPort -EnvironmentFile $environmentFile
Wait-ServiceHealthy -Port $configuredPort | Out-Null

if ($OpenFirewall) {
  $ruleName = "Custom Report Generator TCP $configuredPort"
  if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $configuredPort -Profile Domain,Private | Out-Null
  }
}

Write-Host "Service installed and healthy."
Write-Host "URL: http://$env:COMPUTERNAME`:$configuredPort"
Write-Host "Configuration: $environmentFile"
