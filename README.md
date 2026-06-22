# Custom Report Generator

## Current Features

- Projects dropdown loaded from:
  - `/1/projects`
- Devices multi-select loaded from:
  - `/1/projects/{pname}/devices`
- Type dropdown:
  - `Historical Energy` -> `/1/projects/{pname}/devices/{devid}/histenergy`
  - `Historical Events` -> `/1/projects/{pname}/devices/{devid}/hist/events`
- Date time range filter:
  - `Last 24 Hours`, `Daily`, `Monthly`, `Custom`
- Pivot table output:
  - one row per selected device
  - one column per time bucket in selected range
  - each cell = latest reading in that bucket
- Export to `CSV`, `Excel (.xlsx)`, `PDF`

## Files

- `index.html` - UI and ribbon controls
- `styles.css` - styling
- `app.js` - API integration, pivoting, export logic
- `server.js` - static server, GridVis API proxy, and app persistence API
- `db/schema.sql` - Postgres schema for substations, main intakes, labels, and device mappings

## Run

Install dependencies:

```bash
npm install
```

Start the local web server + API proxy:

```bash
npm start
```

Then open:

`http://localhost:5500`

Postgres is optional for local use. If no Postgres environment variables are set, Substation/Main Intake metadata is saved to:

- `db/app-metadata.json`

Note: PDF/Excel export uses CDN libraries; internet access is required unless you host those libs locally.

## Postgres Persistence

Substation definitions, main intakes, labels, and device mappings are stored by the app persistence API.
By default, when Postgres is not configured, the server uses the local JSON file:

- `db/app-metadata.json`

To use Postgres instead, configure these environment variables before starting the server:

Environment variables:

- `DATABASE_URL`
- or `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`
- optional `PGSSLMODE=require`

The server auto-creates the schema on startup. The explicit schema is also available in:

- `db/schema.sql`

Tables:

- `substations`
  - `id`
  - `project_name`
  - `name`
- `device_substation_mappings`
  - `project_name`
  - `device_id`
  - `substation_id`
- `main_intakes`
  - `id`
  - `project_name`
  - `name`
- `device_main_intake_mappings`
  - `project_name`
  - `device_id`
  - `main_intake_id`
- `device_labels`
  - `project_name`
  - `device_id`
  - `label`

## API Config

Set the base URL and API version in `app.js`:

```js
const API_CONFIG = {
  baseUrl: "/rest",
  apiVersion: "1",
  defaultProjectId: "",
  histenergyValue: "U_Effective",
  histenergyLineType: "L1",
  histenergyTimebase: 900,
  eventsTypes: "",
};
```

`/rest` is proxied by `server.js` to:

`http://gridvisdemo.site:8080/rest`

The app builds paths as:

- `/{apiVersion}/projects/{pname}/devices`
- `/{apiVersion}/projects/{pname}/devices/{devid}/histenergy`
- `/{apiVersion}/projects/{pname}/devices/{devid}/hist/events`

For `histenergy`, query parameters are sent as:

- `value` (from `histenergyValue`)
- `type` (from `histenergyLineType`)
- `timebase` (from `histenergyTimebase`)
- `start`, `end` as `UTC_<unix-seconds>` based on selected range

## Notes

- If API calls fail, demo devices/readings are shown so the UI remains testable.
- `range`, and for custom range `startDate`/`endDate`, are appended as query params on historical endpoints.
