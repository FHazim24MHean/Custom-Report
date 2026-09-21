Set-StrictMode -Version Latest

$script:ServiceName = "CustomReportGenerator"

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an Administrator PowerShell session."
  }
}

function Resolve-NormalizedPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  return [IO.Path]::GetFullPath($Path).TrimEnd([IO.Path]::DirectorySeparatorChar)
}

function Assert-SafeInstallRoot {
  param([Parameter(Mandatory = $true)][string]$InstallRoot)

  $resolved = Resolve-NormalizedPath $InstallRoot
  $driveRoot = [IO.Path]::GetPathRoot($resolved).TrimEnd([IO.Path]::DirectorySeparatorChar)
  if (-not $resolved -or $resolved -eq $driveRoot -or $resolved.Length -lt 8) {
    throw "Unsafe installation path: $resolved"
  }
  return $resolved
}

function Write-Utf8FileWithoutBom {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  [IO.File]::WriteAllText($Path, $Content, [Text.UTF8Encoding]::new($false))
}

function Set-ServiceDirectoryPermissions {
  param([Parameter(Mandatory = $true)][string]$InstallRoot)

  $inheritance = [Security.AccessControl.InheritanceFlags]"ContainerInherit, ObjectInherit"
  $propagation = [Security.AccessControl.PropagationFlags]::None
  $allow = [Security.AccessControl.AccessControlType]::Allow
  $systemSid = [Security.Principal.SecurityIdentifier]::new("S-1-5-18")
  $administratorsSid = [Security.Principal.SecurityIdentifier]::new("S-1-5-32-544")
  $localServiceSid = [Security.Principal.SecurityIdentifier]::new("S-1-5-19")

  $rootAcl = [Security.AccessControl.DirectorySecurity]::new()
  $rootAcl.SetAccessRuleProtection($true, $false)
  $rootAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
      $systemSid,
      [Security.AccessControl.FileSystemRights]::FullControl,
      $inheritance,
      $propagation,
      $allow
    ))
  $rootAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
      $administratorsSid,
      [Security.AccessControl.FileSystemRights]::FullControl,
      $inheritance,
      $propagation,
      $allow
    ))
  $rootAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
      $localServiceSid,
      [Security.AccessControl.FileSystemRights]::ReadAndExecute,
      $inheritance,
      $propagation,
      $allow
    ))
  Set-Acl -LiteralPath $InstallRoot -AclObject $rootAcl

  foreach ($writableName in @("data", "logs")) {
    $writablePath = Join-Path $InstallRoot $writableName
    $writableAcl = Get-Acl -LiteralPath $writablePath
    $writableAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
        $localServiceSid,
        [Security.AccessControl.FileSystemRights]::Modify,
        $inheritance,
        $propagation,
        $allow
      ))
    Set-Acl -LiteralPath $writablePath -AclObject $writableAcl
  }
}

function Wait-ServiceHealthy {
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [int]$TimeoutSeconds = 30
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $healthUrl = "http://127.0.0.1:$Port/health"
  do {
    try {
      $response = Invoke-RestMethod -Method Get -Uri $healthUrl -TimeoutSec 3
      if ($response.status -eq "ok") {
        return $response
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  } while ([DateTime]::UtcNow -lt $deadline)

  throw "Service did not become healthy at $healthUrl within $TimeoutSeconds seconds."
}

function Get-ConfiguredPort {
  param([Parameter(Mandatory = $true)][string]$EnvironmentFile)

  if (-not (Test-Path -LiteralPath $EnvironmentFile -PathType Leaf)) {
    return 5500
  }
  $portLine = Get-Content -LiteralPath $EnvironmentFile | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -First 1
  if ($portLine -and $portLine -match '^\s*PORT\s*=\s*(\d+)\s*$') {
    return [int]$Matches[1]
  }
  return 5500
}
