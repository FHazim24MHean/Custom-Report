# Windows Service Deployment

The package contains the report application, a portable Node.js runtime, locally hosted export libraries, WinSW, and administrative scripts. The GridVis host does not need Node.js, npm, SQL, or internet access.

The service listens on port `8081`. `ApiOrigin` identifies GridVis, normally on port `8080`; it does not set the report page address.

Tariff rates, AFA, and Time of Use rules are saved per project in the report application's JSON configuration store. All measurement data remains sourced from GridVis.

## Requirements

- 64-bit Windows
- Administrator access for installation and updates
- Network connectivity from the service host to GridVis
- TCP `8081` reachable from report users
- A supported Windows account environment for the `LocalService` service account

## Install

1. Extract the complete package to a local folder.
2. Open 64-bit PowerShell as Administrator in that folder.
3. If Windows marked downloaded files as blocked, run:

```powershell
Get-ChildItem -Recurse | Unblock-File
```

4. Install using the GridVis IP address or resolvable hostname:

```powershell
.\install-service.ps1 -ApiOrigin "http://192.228.0.135:8080" -OpenFirewall
```

Do not paste Markdown link syntax such as `[http://host:8080](http://host:8080)`. `ApiOrigin` must be a plain URL.

The installer prompts for a report username and password, installs the automatic service, checks `http://127.0.0.1:8081/health`, and optionally creates a Domain/Private firewall rule.

Open the report using either the server IP or a DNS name that resolves to it:

```text
http://192.228.0.135:8081
http://Gridvis.test.com:8081
```

Using an IP for `ApiOrigin` does not force users to access the report by IP.

## Installation Layout

```text
C:\ProgramData\CustomReportGenerator\
  app\
  runtime\
  config\service.env
  data\app-metadata.json
  data\app-metadata.json.bak
  logs\
  backups\
  scripts\
```

The JSON store contains report configuration only. Historical measurements remain in GridVis.

## Status

From the extracted package or installed `scripts` directory:

```powershell
.\status-service.ps1
```

Basic health:

```powershell
Invoke-RestMethod http://127.0.0.1:8081/health
```

GridVis and configuration health:

```powershell
Invoke-RestMethod http://127.0.0.1:8081/health/deep
```

The deep check returns HTTP `503` if GridVis is unavailable. This does not mean the Windows service has stopped.

## Update

Build and extract the new package, open PowerShell as Administrator in the new package folder, then run:

```powershell
.\update-service.ps1
```

The updater:

1. Validates the staged JavaScript.
2. Preserves `config`, `data`, and logs.
3. Stops the service.
4. Backs up the previous application and runtime.
5. installs the new application and runtime.
6. Restarts the service and checks `/health`.
7. Restores the previous release automatically if startup fails.

Configuration and saved report links are not replaced during an update.

## Change Report Login

Run from the installed scripts directory as Administrator:

```powershell
.\set-report-password.ps1
```

Restart the service after changing credentials:

```powershell
Restart-Service CustomReportGenerator
```

## GridVis Authentication

Edit the protected file:

```text
C:\ProgramData\CustomReportGenerator\config\service.env
```

Configure one upstream method if required:

```text
API_AUTH_HEADER=Bearer token-here
API_BEARER_TOKEN=token-here
API_USERNAME=username
API_PASSWORD=password
API_COOKIE=session-cookie-here
```

Restart after changes:

```powershell
Restart-Service CustomReportGenerator
```

## Backup

Back up these locations:

```text
C:\ProgramData\CustomReportGenerator\config\service.env
C:\ProgramData\CustomReportGenerator\data\app-metadata.json
C:\ProgramData\CustomReportGenerator\data\app-metadata.json.bak
```

The service automatically retains the previous valid metadata file as `.bak`. This is crash recovery, not a replacement for regular external backups.

## Uninstall

Preserve configuration and metadata:

```powershell
.\uninstall-service.ps1
```

Remove configuration and metadata as well:

```powershell
.\uninstall-service.ps1 -RemoveData
```

## Troubleshooting

Check service state:

```powershell
Get-Service CustomReportGenerator
```

Check logs:

```powershell
Get-ChildItem "C:\ProgramData\CustomReportGenerator\logs"
```

Confirm the service is listening:

```powershell
Get-NetTCPConnection -LocalPort 8081 -State Listen
```

Test GridVis from the service host:

```powershell
Invoke-WebRequest "http://192.228.0.135:8080/rest/1/projects"
```

If the report works through `127.0.0.1` but not from another computer, verify the Windows firewall, client network route, and DNS record. If only the IP works, DNS is not resolving to the report server and must be corrected outside the report application.
