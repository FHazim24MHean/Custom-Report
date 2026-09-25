[CmdletBinding()]
param(
  [string]$Version = "1.2.0",
  [string]$NodeVersion = "24.21.0",
  [string]$WinSWVersion = "2.12.0",
  [string]$OutputDirectory = "",
  [switch]$KeepExpandedPackage
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "service-common.ps1")
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$distRoot = Join-Path $sourceRoot "dist"
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $distRoot "CustomReportService-$Version"
}
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$normalizedDistRoot = [IO.Path]::GetFullPath($distRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $OutputDirectory.StartsWith($normalizedDistRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "OutputDirectory must be inside $distRoot"
}

if (Test-Path -LiteralPath $OutputDirectory) {
  Remove-Item -LiteralPath $OutputDirectory -Recurse -Force
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$payloadApp = Join-Path $OutputDirectory "payload\app"
$payloadRuntime = Join-Path $OutputDirectory "payload\runtime"
New-Item -ItemType Directory -Path $payloadApp -Force | Out-Null
New-Item -ItemType Directory -Path $payloadRuntime -Force | Out-Null

foreach ($file in @("server.js", "app.js", "index.html", "styles.css", "login.html", "login.css", "login.js", "package.json", "package-lock.json", "README.md")) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination $payloadApp -Force
}
New-Item -ItemType Directory -Path (Join-Path $payloadApp "db") -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceRoot "db\schema.sql") -Destination (Join-Path $payloadApp "db\schema.sql") -Force

$downloadRoot = Join-Path $env:TEMP "custom-report-service-build-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
try {
  $nodeArchiveName = "node-v$NodeVersion-win-x64.zip"
  $nodeArchive = Join-Path $downloadRoot $nodeArchiveName
  $nodeBaseUrl = "https://nodejs.org/dist/v$NodeVersion"
  Invoke-WebRequest -Uri "$nodeBaseUrl/$nodeArchiveName" -OutFile $nodeArchive -UseBasicParsing
  $checksumFile = Join-Path $downloadRoot "SHASUMS256.txt"
  Invoke-WebRequest -Uri "$nodeBaseUrl/SHASUMS256.txt" -OutFile $checksumFile -UseBasicParsing
  $checksumLine = Get-Content -LiteralPath $checksumFile | Where-Object { $_ -match [Regex]::Escape($nodeArchiveName) } | Select-Object -First 1
  if (-not $checksumLine -or $checksumLine -notmatch '^([a-fA-F0-9]{64})\s+') {
    throw "Unable to find the Node.js checksum for $nodeArchiveName."
  }
  $expectedHash = $Matches[1].ToUpperInvariant()
  $actualHash = (Get-FileHash -LiteralPath $nodeArchive -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($actualHash -ne $expectedHash) {
    throw "Node.js archive checksum verification failed."
  }

  $expandedNode = Join-Path $downloadRoot "node"
  Expand-Archive -LiteralPath $nodeArchive -DestinationPath $expandedNode
  $nodeDistribution = Get-ChildItem -LiteralPath $expandedNode -Directory | Select-Object -First 1
  if (-not $nodeDistribution) { throw "The Node.js archive did not contain a runtime directory." }
  Copy-Item -Path (Join-Path $nodeDistribution.FullName "*") -Destination $payloadRuntime -Recurse -Force

  $winSwUrl = "https://github.com/winsw/winsw/releases/download/v$WinSWVersion/WinSW-x64.exe"
  Invoke-WebRequest -Uri $winSwUrl -OutFile (Join-Path $OutputDirectory "CustomReportService.exe") -UseBasicParsing

  $npmCommand = Join-Path $payloadRuntime "npm.cmd"
  & $npmCommand ci --omit=dev --prefix $payloadApp
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed with exit code $LASTEXITCODE." }
} finally {
  if (Test-Path -LiteralPath $downloadRoot) {
    Remove-Item -LiteralPath $downloadRoot -Recurse -Force
  }
}

foreach ($file in @(
    "CustomReportService.xml",
    "service.env.example",
    "service-common.ps1",
    "install-service.ps1",
    "update-service.ps1",
    "status-service.ps1",
    "uninstall-service.ps1",
    "set-report-password.ps1",
    "hash-password.js"
  )) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $OutputDirectory -Force
}
Write-Utf8FileWithoutBom -Path (Join-Path $OutputDirectory "VERSION") -Content "$Version`n"

$archivePath = "$OutputDirectory.zip"
if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}
Compress-Archive -Path (Join-Path $OutputDirectory "*") -DestinationPath $archivePath -CompressionLevel Optimal

if (-not $KeepExpandedPackage) {
  Remove-Item -LiteralPath $OutputDirectory -Recurse -Force
}

Write-Host "Service package created: $archivePath"
