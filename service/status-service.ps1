[CmdletBinding()]
param(
  [string]$InstallRoot = (Join-Path $env:ProgramData "CustomReportGenerator")
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "service-common.ps1")

$InstallRoot = Assert-SafeInstallRoot $InstallRoot
$service = Get-Service -Name $script:ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
  Write-Host "Service is not installed."
  exit 1
}

Write-Host "Service status: $($service.Status)"
if ($service.Status -eq "Running") {
  $environmentFile = Join-Path $InstallRoot "config\service.env"
  $configuredPort = Get-ConfiguredPort -EnvironmentFile $environmentFile
  try {
    $health = Wait-ServiceHealthy -Port $configuredPort -TimeoutSeconds 5
    Write-Host "Health: $($health.status) ($($health.persistence))"
    Write-Host "URL: http://$env:COMPUTERNAME`:$configuredPort"
  } catch {
    Write-Warning $_.Exception.Message
    exit 2
  }
}
