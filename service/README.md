# Windows Service Deployment

The service package contains the application, production dependencies, a portable Node.js runtime, and WinSW. The host PC does not need Node.js, npm, or SQL Server. PostgreSQL is optional; without it, mappings and saved report links use the protected JSON store under `C:\ProgramData\CustomReportGenerator\data`.

The report service always listens on TCP port `8081`. `API_ORIGIN` identifies the GridVis REST server, normally on port `8080`; it does not set the report page address.

## Requirements

Build PC:

- 64-bit Node.js/npm on Windows. The signed `node.exe` from this installation is copied into the service package.
- Windows PowerShell 5.1 or later for ZIP compression only.
- Outbound HTTPS access to `github.com` and `registry.npmjs.org`.

Host PC:

- 64-bit Windows and an Administrator PowerShell session.
- .NET Framework 4.6.1 or later. It is included with Windows 10 version 1511 and Windows Server 2016 or later.
- Network access from the host to the GridVis API address.
- Inbound TCP `8081` access from report users. The installer can create the Domain/Private firewall rule.
- No separate Node.js/npm installation.
- Client browsers need HTTPS access to `cdn.jsdelivr.net` for PDF and Excel export libraries. The page, CSV export, and GridVis proxy still run without it, but PDF and Excel exports will not work until those libraries are bundled locally.

## Build A Package

Run this in the repository on an internet-connected build PC:

```powershell
npm run service:package
```

The Node-based builder copies the installed Node.js runtime, downloads the .NET Framework build of WinSW from its official GitHub release, verifies the pinned WinSW SHA-256, installs production dependencies, and creates:

```text
dist\CustomReportService-1.2.3.zip
```

The build verifies both the Node.js archive and the pinned WinSW service-wrapper hash. The final line prints the ZIP's SHA-256 hash. Record that value so the copy placed on the host can be verified.

Override only the package version when preparing a later application release:

```powershell
node .\service\build-service-package.js --version 1.3.0
```

Do not override `--winsw-version`, `--winsw-asset`, or `--winsw-sha256` unless changing to a separately reviewed WinSW release. The defaults are a matched and pinned set; supplying an unrelated hash makes the build fail closed.

If a build reports a download error, test the three required endpoints before retrying:

```powershell
Test-NetConnection github.com -Port 443
Test-NetConnection registry.npmjs.org -Port 443
```

The builder retries the WinSW download three times and removes incomplete downloads. If direct GitHub access is unavailable because of a corporate proxy, use the approved local-file option below.

If security policy blocks executable downloads from build scripts, download `WinSW.NET461.exe` version `2.12.0` from the official WinSW GitHub release using the organization's approved process, then provide it locally. The builder still rejects it unless its SHA-256 matches the pinned value:

```powershell
npm run service:package -- --winsw-path "C:\ApprovedDownloads\WinSW.NET461.exe"
```

## Copy And Extract

Copy the completed ZIP to the host. Do not run scripts from inside Windows Explorer's ZIP view.

In PowerShell, verify that the host copy has the same hash printed by the build:

```powershell
Get-FileHash "C:\Deploy\CustomReportService-1.2.3.zip" -Algorithm SHA256
```

Then unblock and fully extract it:

```powershell
$zip = "C:\Deploy\CustomReportService-1.2.3.zip"
$destination = "C:\Deploy\CustomReportService-1.2.3"
Unblock-File -LiteralPath $zip
if (Test-Path -LiteralPath $destination) { throw "Remove or rename the existing destination first: $destination" }
Expand-Archive -LiteralPath $zip -DestinationPath $destination
Set-Location $destination
```

Confirm that the important files exist before installing:

```powershell
Test-Path .\install-service.ps1
Test-Path .\CustomReportService.exe
Test-Path .\payload\runtime\node.exe
Test-Path .\payload\app\server.js
```

All four commands must return `True`. If extraction reports that the archive is invalid, truncated, or missing its central directory, delete the host copy, copy it again, and compare its SHA-256 hash. Do not continue with a partially extracted folder.

## Install On The Host

Open PowerShell as Administrator in the extracted directory. Optionally confirm that the host can reach GridVis:

```powershell
Test-NetConnection 192.228.0.135 -Port 8080
```

Install using a plain URL, without Markdown brackets or parentheses:

```powershell
.\install-service.ps1 -ApiOrigin "http://192.228.0.135:8080" -OpenFirewall
```

Installation prompts for a report username and password. The service stores only a salted password hash. Everyone using this account can view reports and edit Configuration, so distribute it only to authorized staff.

The default installation path is:

```text
C:\ProgramData\CustomReportGenerator
```

The service runs as the low-privilege `LocalService` account. The installer restricts the installation directory to administrators, Local System, and the service account. It validates the packaged JavaScript before installing, waits for the local health endpoint, and removes the new service registration if startup fails.

The distributed PowerShell scripts are readable source but are not Authenticode-signed. On a managed network that requires signed scripts, sign them with the organization's code-signing certificate before deployment. Do not weaken the machine-wide execution policy or add a broad antivirus exclusion.

Verify the installation on the host:

```powershell
Get-Service CustomReportGenerator
Invoke-RestMethod http://127.0.0.1:8081/health
```

Users open the report with the report server's reachable IP address or DNS name, not the GridVis API address:

```text
http://<REPORT-SERVER-IP>:8081
```

## Configuration

Edit protected service configuration here if GridVis authentication or PostgreSQL settings are required:

```text
C:\ProgramData\CustomReportGenerator\config\service.env
```

Restart the service after changing configuration:

```powershell
Restart-Service CustomReportGenerator
```

To rotate the report password, run from `C:\ProgramData\CustomReportGenerator\scripts` as Administrator:

```powershell
.\set-report-password.ps1
```

Report login uses an HttpOnly, SameSite=Lax browser-session cookie. Signing out or closing the browser session removes the cookie; restarting the service also invalidates existing sessions. Some browsers can restore session cookies when restoring tabs, so sign out on shared workstations. The service expires sessions after 24 hours of inactivity.

For deployment beyond a trusted isolated network, use HTTPS through a reverse proxy. The report login protects `/rest/*` and `/app-api/*`, but it does not provide per-user roles or GridVis single sign-on.

## Update

Build the new ZIP on the build PC, copy it to the host, verify its hash, and extract it to a new folder. Run the updater from that new extracted folder as Administrator:

```powershell
.\update-service.ps1
```

The updater:

1. Copies the new release into a staging directory.
2. Runs JavaScript syntax checks before touching the live service.
3. Stops the service.
4. Moves the existing app and runtime into a timestamped backup.
5. Activates the new app and runtime.
6. Starts the service and checks `/health`.
7. Restores the previous release automatically if startup or the health check fails.

When upgrading an installation that predates report login, the updater prompts for a report username and password before stopping the old service. It also migrates the service port to `8081`.

Configuration, JSON metadata, PostgreSQL data, logs, device mappings, and saved `/r/{link-name}` links are retained. Backups are stored under:

```text
C:\ProgramData\CustomReportGenerator\backups
```

## Troubleshooting

### ZIP Or Extraction Error

- Compare `Get-FileHash` on the build PC and host. Different hashes mean the ZIP was changed or incompletely copied.
- Run `Unblock-File` before `Expand-Archive`.
- Extract to a normal local directory such as `C:\Deploy`, not a network share or Windows Explorer's ZIP view.
- Ensure the destination drive has at least 300 MB free.
- Delete any partial destination folder before extracting a fresh copy.

### Package Is Incomplete

Run the installer from the extracted package root. That directory must contain `install-service.ps1`, `CustomReportService.exe`, and the `payload` directory. Re-extract the ZIP if any required file is missing.

### Service Does Not Become Healthy

The installer rolls back the new service registration but keeps the files for diagnosis. Review:

```text
C:\ProgramData\CustomReportGenerator\logs
C:\ProgramData\CustomReportGenerator\config\service.env
```

Then correct the issue and rerun `install-service.ps1`. Also check whether another process is already using port `8081`:

```powershell
Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue
```

### Service Works But GridVis Data Does Not Load

This is separate from ZIP extraction and service startup. Confirm `API_ORIGIN` in `service.env`, test the API host and port with `Test-NetConnection`, and configure `API_AUTH_HEADER`, `API_BEARER_TOKEN`, `API_USERNAME`/`API_PASSWORD`, or `API_COOKIE` if the GridVis endpoint requires authentication.

### Other PCs Cannot Open Port 8081

Confirm the service works locally first, then inspect the host's active Windows network profile:

```powershell
Invoke-RestMethod http://127.0.0.1:8081/health
Get-NetConnectionProfile
```

The automatic firewall rule applies only to Domain and Private profiles. If the host network is classified as Public, have the network administrator correct the profile or create an appropriately restricted firewall rule instead of broadly exposing the service.

## Status

From the installed `scripts` directory:

```powershell
.\status-service.ps1
```

## Uninstall

Remove only the Windows Service while preserving files and data:

```powershell
.\uninstall-service.ps1
```

Remove application files while preserving configuration and metadata:

```powershell
.\uninstall-service.ps1 -RemoveApplicationFiles
```

Remove application files, configuration, and metadata:

```powershell
.\uninstall-service.ps1 -RemoveApplicationFiles -RemovePersistentData
```
