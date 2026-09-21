[CmdletBinding()]
param(
  [string]$InstallRoot = (Join-Path $env:ProgramData "CustomReportGenerator"),
  [switch]$RemoveApplicationFiles,
  [switch]$RemovePersistentData
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "service-common.ps1")

Assert-Administrator
$InstallRoot = Assert-SafeInstallRoot $InstallRoot
$serviceExecutable = Join-Path $InstallRoot "CustomReportService.exe"
$service = Get-Service -Name $script:ServiceName -ErrorAction SilentlyContinue

if ($service) {
  if (-not (Test-Path -LiteralPath $serviceExecutable -PathType Leaf)) {
    throw "Cannot uninstall because the service wrapper is missing: $serviceExecutable"
  }
  if ($service.Status -ne "Stopped") {
    & $serviceExecutable stop
    if ($LASTEXITCODE -ne 0) { throw "WinSW failed to stop the service (exit code $LASTEXITCODE)." }
  }
  & $serviceExecutable uninstall
  if ($LASTEXITCODE -ne 0) { throw "WinSW failed to uninstall the service (exit code $LASTEXITCODE)." }
}

if ($RemoveApplicationFiles) {
  foreach ($name in @("app", "runtime", "logs", "backups", "scripts", "CustomReportService.exe", "CustomReportService.xml")) {
    $target = Join-Path $InstallRoot $name
    if (Test-Path -LiteralPath $target) {
      Remove-Item -LiteralPath $target -Recurse -Force
    }
  }
}

if ($RemovePersistentData) {
  foreach ($name in @("config", "data")) {
    $target = Join-Path $InstallRoot $name
    if (Test-Path -LiteralPath $target) {
      Remove-Item -LiteralPath $target -Recurse -Force
    }
  }
}

Write-Host "Service uninstalled."
if (-not $RemovePersistentData) {
  Write-Host "Configuration and report metadata were preserved under $InstallRoot."
}
