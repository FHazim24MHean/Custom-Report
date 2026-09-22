[CmdletBinding()]
param(
  [string]$InstallRoot = (Join-Path $env:ProgramData "CustomReportGenerator")
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "service-common.ps1")

Assert-Administrator
$InstallRoot = Assert-SafeInstallRoot $InstallRoot
$environmentFile = Join-Path $InstallRoot "config\service.env"
$nodePath = Join-Path $InstallRoot "runtime\node.exe"
$hashScript = Join-Path $PSScriptRoot "hash-password.js"
foreach ($file in @($environmentFile, $nodePath, $hashScript)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "Missing required file: $file"
  }
}

Set-ReportLoginCredential -EnvironmentFile $environmentFile -NodePath $nodePath -HashScript $hashScript
Restart-Service -Name $script:ServiceName
Write-Host "Report login updated. Existing sessions were signed out."
