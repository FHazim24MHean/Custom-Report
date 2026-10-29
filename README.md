# Custom Report Generator

Internal electrical reporting application designed to run beside a GridVis installation. A single Node.js service hosts the browser UI, protects it with a report login, proxies GridVis REST requests, and persists report configuration in JSON.

The production service always listens on TCP port `8081`.

## Included Features

- Substation and Main Intake report tables
- HT/LV device and transformer mappings
- Per-device compliance thresholds
- Historical value and power-quality event reports
- Group-filtered compliance and metric-health analytics
- In-memory energy and estimated-billing analytics
- Per-project tariff, AFA, and Time of Use configuration
- Stable `/r/{slug}` dashboard links
- PDF, Excel, and CSV exports
- Local PDF and Excel libraries; no browser internet access required
- Windows service package with automatic startup and restart

## Architecture

```text
Browser -> Custom Report Service :8081 -> GridVis REST API :8080
                  |
                  +-> versioned JSON configuration
```

Historical measurements remain in GridVis. The JSON store contains configuration only: groups, assignments, labels, transformer mappings, thresholds, report links, tariff rates, AFA, and Time of Use rules.

Generating a historical-values report creates one temporary browser report session with three result tabs: **Data Report**, **Analytics**, and **Billing Analytics**. Closing or reloading the browser discards the generated measurements and calculations; saved project billing configuration remains available.

## Repository Layout

- `server.js` - production entry point
- `lib/server-app.js` - HTTP, authentication, proxy, and application routes
- `lib/metadata-store.js` - versioned JSON persistence and recovery
- `app.mjs` - browser application coordinator
- `js/domain/` - tested report calculations
- `js/api/` - bounded GridVis request execution
- `js/config/` - report and metric definitions
- `vendor/` - locally packaged export libraries
- `service/` - Windows service build, installation, update, and support scripts
- `test/` - calculation, persistence, and HTTP smoke tests

## Local Development

Requirements:

- Node.js 20 or newer
- npm
- Network access to the target GridVis REST API

Install build dependencies and run tests:

```powershell
npm ci
npm test
```

Generate a password hash:

```powershell
$env:REPORT_PASSWORD_HASH = "your-password" | node .\service\hash-password.js
```

Set the environment and start the service:

```powershell
$env:API_ORIGIN = "http://192.228.0.135:8080"
$env:REPORT_USERNAME = "reportadmin"
$env:REPORT_PASSWORD_HASH = "scrypt:..."
npm start
```

Open `http://127.0.0.1:8081`.

Tariff rates, AFA, and Time of Use rules are configured per project in the app. Measurement data continues to come from GridVis and is not copied into the JSON configuration store.

Optional upstream authentication variables:

- `API_AUTH_HEADER`
- `API_BEARER_TOKEN`
- `API_USERNAME` and `API_PASSWORD`
- `API_COOKIE`

## Configuration Storage

The default development location is:

```text
%USERPROFILE%\.custom-report-generator\app-metadata.json
```

Set `APP_METADATA_PATH` to use another location. The Windows installer uses:

```text
C:\ProgramData\CustomReportGenerator\data\app-metadata.json
```

Writes are serialized and recoverable. Before replacing the current file, the service keeps the previous valid file as `app-metadata.json.bak`. Existing browser-local thresholds and transformer mappings are migrated when a project is first loaded.

## GridVis Requests

The browser first discovers available value types from:

```text
/rest/1/projects/{project}/devices/{device}/hist/values
```

It then requests actual historical aggregates from:

```text
/rest/1/projects/{project}/devices/{device}/histvalues
```

GridVis requests are concurrency-limited and transient GET failures are retried. Starting a new report cancels the previous in-progress report.

## Analytics

Generate a historical values report, then open the **Analytics** result tab. The analytics view uses the current in-memory report and can be filtered to any Substation or Main Intake included in that report. It summarizes device count, compliant and failed reading rows, amber threshold warnings, power-quality events, and per-parameter health.

Analytics does not make additional GridVis requests or persist measurement history in the JSON configuration store.

## Billing Analytics

The **Billing Analytics** result tab uses GridVis `ActiveEnergyConsumed`, `ActiveEnergySupplied`, and `PowerActive` values when the selected meter exposes them. It calculates imported/exported kWh, maximum demand, average power factor, data coverage, AFA adjustments, and estimated charges.

Under **Configuration > Billing Configuration**, users can inspect the active tariff list and current AFA returned by the billing application. Each project can use those system values or save a manual report override in the Custom Report JSON store. System mode uses the active flat energy rate, compatible RM/kW demand rates, and current AFA. It does not alter the billing application's database.

Users can still adjust import rate, export credit, demand rate, fixed charge, tax, currency, and AFA for the current generated report. These session edits are not saved. PDF and Excel exports include the effective rate source, tariff assumptions, billing summary, AFA charge, and meter detail.

Billing output is an estimate and is not an invoice. A meter without consumed active-energy data remains visible as unavailable instead of receiving an inferred charge.

## Report Links

Create links under **Configuration > Report Links**. A saved link resolves current group membership each time it is opened:

```text
http://REPORT-SERVER:8081/r/perodua-ss12-ht
```

Direct query links remain supported:

```text
http://REPORT-SERVER:8081/?project=PROJECT&group=SS12&groupType=substation&side=HT&range=today&autorun=1
```

## Health Checks

Basic process health:

```powershell
Invoke-RestMethod http://127.0.0.1:8081/health
```

Configuration and GridVis connectivity:

```powershell
Invoke-RestMethod http://127.0.0.1:8081/health/deep
```

The deep endpoint returns HTTP `503` when configuration cannot be read or GridVis cannot be reached.

## Windows Service Package

Build on 64-bit Windows with Node.js and npm installed:

```powershell
node .\service\build-service-package.js --version 1.3.0 --winsw-version 2.12.0 --winsw-asset WinSW.NET461.exe --winsw-sha256 B5066B7BBDFBA1293E5D15CDA3CAAEA88FBEAB35BD5B38C41C913D492AADFC4F
```

The generated package contains Node.js, the application, export libraries, WinSW, and installer scripts. The target host does not need Node.js, npm, SQL, or internet access.

See [service/README.md](service/README.md) for installation, updating, backup, firewall, and troubleshooting instructions.
