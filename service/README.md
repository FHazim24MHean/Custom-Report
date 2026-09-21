# Windows Service Deployment

The service package contains the application, production dependencies, a portable Node.js runtime, and WinSW. The host PC does not need Node.js or npm installed.

## Build a package

Run this on a Windows build PC with internet access:

```powershell
npm run service:package
```

The build downloads Node.js from `nodejs.org`, verifies its published SHA-256 checksum, downloads WinSW from its official GitHub release, installs production dependencies, and creates:

```text
dist\CustomReportService-1.0.0.zip
```

Override versions when preparing a new release:

```powershell
.\service\build-service-package.ps1 -Version 1.1.0 -NodeVersion 24.21.0
```

## Install on the host

Extract the ZIP, open PowerShell as Administrator in the extracted folder, then run:

```powershell
.\install-service.ps1 -ApiOrigin "http://GRIDVIS-HOST:8080" -OpenFirewall
```

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
