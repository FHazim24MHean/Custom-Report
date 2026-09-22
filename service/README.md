# Windows Service Deployment

The service package contains the application, production dependencies, a portable Node.js runtime, and WinSW. The host PC does not need Node.js or npm installed.

## Build a package

Run this on a Windows build PC with internet access:

```powershell
npm run service:package
```

The build downloads Node.js from `nodejs.org`, verifies its published SHA-256 checksum, downloads WinSW from its official GitHub release, installs production dependencies, and creates:

```text
dist\CustomReportService-1.1.0.zip
```

Override versions when preparing a new release:

```powershell
.\service\build-service-package.ps1 -Version 1.2.0 -NodeVersion 24.21.0
```

## Install on the host

Extract the ZIP, open PowerShell as Administrator in the extracted folder, then run:

```powershell
.\install-service.ps1 -ApiOrigin "http://GRIDVIS-HOST:8080" -OpenFirewall
```

Installation prompts for a report username and password. The service stores only a salted password hash. Everyone using this account can view reports and edit Configuration, so distribute it only to authorized staff.

The default installation path is:

```text
C:\ProgramData\CustomReportGenerator
```

The service runs as the low-privilege `LocalService` account. The installer restricts the installation directory to administrators, Local System, and the service account.

Edit protected service configuration here if authentication or PostgreSQL settings are required:

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

Report login uses an HttpOnly, SameSite=Lax browser-session cookie. Signing out or closing the browser session removes the cookie; restarting the service also invalidates existing sessions. Some browsers can restore session cookies when restoring tabs, so sign out on shared workstations. The service also expires sessions after 24 hours of inactivity.

For deployment beyond a trusted isolated network, use HTTPS via a reverse proxy. The report login protects `/rest/*` and `/app-api/*`, but it does not provide per-user roles or GridVis single sign-on.

## Update

Build and extract the new service ZIP on the host, then run its updater as Administrator:

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

When upgrading an installation that predates report login, the updater prompts for a report username and password before stopping the old service.

Configuration, JSON metadata, PostgreSQL data, and logs are not replaced during an update.

Backups are retained under:

```text
C:\ProgramData\CustomReportGenerator\backups
```

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
