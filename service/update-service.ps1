[CmdletBinding()]
param(
  [string]$InstallRoot = (Join-Path $env:ProgramData "CustomReportGenerator")
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "service-common.ps1")

Assert-Administrator
$InstallRoot = Assert-SafeInstallRoot $InstallRoot
$payloadRoot = Join-Path $PSScriptRoot "payload"
$serviceExecutable = Join-Path $InstallRoot "CustomReportService.exe"
$environmentFile = Join-Path $InstallRoot "config\service.env"

foreach ($requiredPath in @(
    (Join-Path $payloadRoot "app\server.js"),
    (Join-Path $payloadRoot "runtime\node.exe"),
    $serviceExecutable,
    $environmentFile,
    (Join-Path $PSScriptRoot "hash-password.js")
  )) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Update cannot continue. Missing: $requiredPath"
  }
}

if (-not (Get-Service -Name $script:ServiceName -ErrorAction SilentlyContinue)) {
  throw "Service $($script:ServiceName) is not installed. Run install-service.ps1 first."
}

$environmentContent = Get-Content -LiteralPath $environmentFile -Raw
if ($environmentContent -notmatch '(?m)^REPORT_USERNAME=.+$' -or
    $environmentContent -notmatch '(?m)^REPORT_PASSWORD_HASH=scrypt:[a-f0-9]{32}:[a-f0-9]{128}$') {
  if ($environmentContent -notmatch '(?m)^REPORT_USERNAME=') {
    $environmentContent += "`nREPORT_USERNAME=`n"
  }
  if ($environmentContent -notmatch '(?m)^REPORT_PASSWORD_HASH=') {
    $environmentContent += "REPORT_PASSWORD_HASH=`n"
  }
  Write-Utf8FileWithoutBom -Path $environmentFile -Content $environmentContent
  Set-ReportLoginCredential `
    -EnvironmentFile $environmentFile `
    -NodePath (Join-Path $payloadRoot "runtime\node.exe") `
    -HashScript (Join-Path $PSScriptRoot "hash-password.js")
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stagingRoot = Join-Path $InstallRoot ".update-$timestamp"
$backupRoot = Join-Path $InstallRoot "backups\$timestamp"
$appPath = Join-Path $InstallRoot "app"
$runtimePath = Join-Path $InstallRoot "runtime"
$appBackedUp = $false
$runtimeBackedUp = $false
$serviceStopped = $false
$serviceTouched = $false

try {
  New-Item -ItemType Directory -Path (Join-Path $stagingRoot "app") -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $stagingRoot "runtime") -Force | Out-Null
  Copy-Item -Path (Join-Path $payloadRoot "app\*") -Destination (Join-Path $stagingRoot "app") -Recurse -Force
  Copy-Item -Path (Join-Path $payloadRoot "runtime\*") -Destination (Join-Path $stagingRoot "runtime") -Recurse -Force

  $stagedNode = Join-Path $stagingRoot "runtime\node.exe"
  & $stagedNode --check (Join-Path $stagingRoot "app\server.js")
  if ($LASTEXITCODE -ne 0) { throw "The staged server.js failed its syntax check." }
  & $stagedNode --check (Join-Path $stagingRoot "app\app.js")
  if ($LASTEXITCODE -ne 0) { throw "The staged app.js failed its syntax check." }

  $serviceTouched = $true
  & $serviceExecutable stop
  if ($LASTEXITCODE -ne 0) { throw "WinSW failed to stop the service (exit code $LASTEXITCODE)." }
  $serviceStopped = $true

  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
  Move-Item -LiteralPath $appPath -Destination (Join-Path $backupRoot "app")
  $appBackedUp = $true
  Move-Item -LiteralPath $runtimePath -Destination (Join-Path $backupRoot "runtime")
  $runtimeBackedUp = $true
  Move-Item -LiteralPath (Join-Path $stagingRoot "app") -Destination $appPath
  Move-Item -LiteralPath (Join-Path $stagingRoot "runtime") -Destination $runtimePath

  & $serviceExecutable start
  if ($LASTEXITCODE -ne 0) { throw "WinSW failed to start the updated service (exit code $LASTEXITCODE)." }
  $serviceStopped = $false

  $configuredPort = Get-ConfiguredPort -EnvironmentFile $environmentFile
  Wait-ServiceHealthy -Port $configuredPort | Out-Null
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot "hash-password.js") -Destination (Join-Path $InstallRoot "scripts\hash-password.js") -Force
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot "set-report-password.ps1") -Destination (Join-Path $InstallRoot "scripts\set-report-password.ps1") -Force
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot "service-common.ps1") -Destination (Join-Path $InstallRoot "scripts\service-common.ps1") -Force
  Set-ServiceDirectoryPermissions -InstallRoot $InstallRoot
  Write-Host "Update completed successfully. Backup: $backupRoot"
} catch {
  Write-Warning "Update failed. Restoring the previous release. $($_.Exception.Message)"
  if ($serviceTouched -and -not $serviceStopped) {
    try { & $serviceExecutable stop | Out-Null } catch { }
  }

  if ($appBackedUp -and (Test-Path -LiteralPath (Join-Path $backupRoot "app"))) {
    if (Test-Path -LiteralPath $appPath) { Remove-Item -LiteralPath $appPath -Recurse -Force }
    Move-Item -LiteralPath (Join-Path $backupRoot "app") -Destination $appPath
  }
  if ($runtimeBackedUp -and (Test-Path -LiteralPath (Join-Path $backupRoot "runtime"))) {
    if (Test-Path -LiteralPath $runtimePath) { Remove-Item -LiteralPath $runtimePath -Recurse -Force }
    Move-Item -LiteralPath (Join-Path $backupRoot "runtime") -Destination $runtimePath
  }

  if ($serviceTouched) {
    try { & $serviceExecutable start | Out-Null } catch { }
  }
  throw
} finally {
  if (Test-Path -LiteralPath $stagingRoot) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
  }
}
