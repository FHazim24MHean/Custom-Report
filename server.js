const http = require("http");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");

const PORT = Number(process.env.PORT || 5500);
const API_ORIGIN = process.env.API_ORIGIN || "http://gridvisdemo.site:8080";
const STATIC_ROOT = process.cwd();
const APP_API_PREFIX = "/app-api";
const LOCAL_METADATA_PATH = path.join(STATIC_ROOT, "db", "app-metadata.json");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

let pgModule = null;
let dbPool = null;
let dbInitPromise = null;
let localMetadataWriteQueue = Promise.resolve();

function send(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function safeJoin(root, requestedPath) {
  const normalized = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const resolved = path.resolve(
    root,
    `.${normalized.startsWith(path.sep) ? normalized : `${path.sep}${normalized}`}`
  );
  if (!resolved.startsWith(path.resolve(root))) {
    return null;
  }
  return resolved;
}

function serveStatic(req, res) {
  let pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (pathname === "/") pathname = "/index.html";

  const filePath = safeJoin(STATIC_ROOT, pathname);
  if (!filePath) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.stat(filePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      send(res, 404, "Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

async function proxyApi(req, res) {
  const targetUrl = new URL(req.url, API_ORIGIN);
  const incomingHeaders = { ...req.headers };
  delete incomingHeaders.host;
  delete incomingHeaders.origin;
  delete incomingHeaders.referer;

  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = req;
  }

  try {
    const fetchOptions = {
      method: req.method,
      headers: incomingHeaders,
      body,
      redirect: "manual",
    };

    if (body) {
      fetchOptions.duplex = "half";
    }

    const upstreamResponse = await fetch(targetUrl, fetchOptions);

    const responseHeaders = {};
    upstreamResponse.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey !== "transfer-encoding" &&
        lowerKey !== "content-encoding" &&
        lowerKey !== "content-length"
      ) {
        responseHeaders[key] = value;
      }
    });
    responseHeaders["cache-control"] = "no-store";

    res.writeHead(upstreamResponse.status, responseHeaders);
    if (upstreamResponse.body) {
      Readable.fromWeb(upstreamResponse.body).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    send(res, 502, `Proxy error: ${error.message}`);
  }
}

function getPgModule() {
  if (!pgModule) {
    try {
      pgModule = require("pg");
    } catch (_error) {
      throw new Error('Missing Postgres dependency "pg". Run "npm install".');
    }
  }
  return pgModule;
}

function hasDatabaseConfig() {
  return Boolean(process.env.DATABASE_URL || process.env.PGDATABASE);
}

function useLocalMetadataStore() {
  return !hasDatabaseConfig();
}

function getDbPool() {
  if (dbPool) {
    return dbPool;
  }

  if (!hasDatabaseConfig()) {
    throw new Error(
      "Postgres is not configured. Set DATABASE_URL or PGDATABASE/PGHOST/PGUSER/PGPASSWORD."
    );
  }

  const { Pool } = getPgModule();
  const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
      }
    : {
        host: process.env.PGHOST || "localhost",
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
      };

  if (String(process.env.PGSSLMODE || "").toLowerCase() === "require") {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  dbPool = new Pool(poolConfig);
  return dbPool;
}

function createEmptyLocalMetadataStore() {
  return {
    substations: [],
    deviceSubstationMappings: [],
    mainIntakes: [],
    deviceMainIntakeMappings: [],
    deviceLabels: [],
  };
}

function normalizeLocalMetadataStore(store) {
  const safeStore = store && typeof store === "object" ? store : {};
  return {
    substations: Array.isArray(safeStore.substations) ? safeStore.substations : [],
    deviceSubstationMappings: Array.isArray(safeStore.deviceSubstationMappings)
      ? safeStore.deviceSubstationMappings
      : [],
    mainIntakes: Array.isArray(safeStore.mainIntakes) ? safeStore.mainIntakes : [],
    deviceMainIntakeMappings: Array.isArray(safeStore.deviceMainIntakeMappings)
      ? safeStore.deviceMainIntakeMappings
      : [],
    deviceLabels: Array.isArray(safeStore.deviceLabels) ? safeStore.deviceLabels : [],
  };
}

async function readLocalMetadataStore() {
  try {
    const text = await fs.promises.readFile(LOCAL_METADATA_PATH, "utf8");
    return normalizeLocalMetadataStore(JSON.parse(text));
  } catch (error) {
    if (error.code === "ENOENT") {
      return createEmptyLocalMetadataStore();
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Local metadata store is not valid JSON: ${LOCAL_METADATA_PATH}`);
    }
    throw error;
  }
}

async function writeLocalMetadataStore(store) {
  await fs.promises.mkdir(path.dirname(LOCAL_METADATA_PATH), { recursive: true });
  await fs.promises.writeFile(
    LOCAL_METADATA_PATH,
    `${JSON.stringify(normalizeLocalMetadataStore(store), null, 2)}\n`,
    "utf8"
  );
}

function withLocalMetadataStore(mutator) {
  const nextWrite = localMetadataWriteQueue.then(async () => {
    const store = await readLocalMetadataStore();
    const result = await mutator(store);
    await writeLocalMetadataStore(store);
    return result;
  });
  localMetadataWriteQueue = nextWrite.catch(() => {});
  return nextWrite;
}

function getNextLocalId(rows) {
  return String(
    (Array.isArray(rows) ? rows : []).reduce((maxId, row) => {
      const numericId = Number.parseInt(String(row?.id || "0"), 10);
      return Number.isFinite(numericId) ? Math.max(maxId, numericId) : maxId;
    }, 0) + 1
  );
}

function sortLocalRowsByName(left, right) {
  return (
    String(left?.name || "").localeCompare(String(right?.name || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    }) ||
    String(left?.name || "").localeCompare(String(right?.name || "")) ||
    String(left?.id || "").localeCompare(String(right?.id || ""), undefined, { numeric: true })
  );
}

function buildLocalProjectPayload(projectName, store) {
  const safeProjectName = String(projectName || "").trim();
  const substations = store.substations
    .filter((row) => String(row?.project_name || "") === safeProjectName)
    .sort(sortLocalRowsByName);
  const substationIds = new Set(substations.map((row) => String(row.id)));
  const assignments = store.deviceSubstationMappings
    .filter(
      (row) =>
        String(row?.project_name || "") === safeProjectName &&
        substationIds.has(String(row?.substation_id || ""))
    )
    .sort((left, right) => String(left.device_id || "").localeCompare(String(right.device_id || "")));
  const labels = store.deviceLabels
    .filter((row) => String(row?.project_name || "") === safeProjectName)
    .sort((left, right) => String(left.device_id || "").localeCompare(String(right.device_id || "")));
  const mainIntakes = store.mainIntakes
    .filter((row) => String(row?.project_name || "") === safeProjectName)
    .sort(sortLocalRowsByName);
  const mainIntakeIds = new Set(mainIntakes.map((row) => String(row.id)));
  const mainIntakeAssignments = store.deviceMainIntakeMappings
    .filter(
      (row) =>
        String(row?.project_name || "") === safeProjectName &&
        mainIntakeIds.has(String(row?.main_intake_id || ""))
    )
    .sort((left, right) => String(left.device_id || "").localeCompare(String(right.device_id || "")));

  return normalizeProjectSubstationPayload(
    safeProjectName,
    substations,
    assignments,
    labels,
    mainIntakes,
    mainIntakeAssignments
  );
}

async function fetchLocalProjectSubstationConfig(projectName) {
  const store = await readLocalMetadataStore();
  return buildLocalProjectPayload(projectName, store);
}

async function initializeDatabase() {
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      const pool = getDbPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS substations (
          id BIGSERIAL PRIMARY KEY,
          project_name TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (project_name, name)
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS device_substation_mappings (
          project_name TEXT NOT NULL,
          device_id TEXT NOT NULL,
          substation_id BIGINT NOT NULL REFERENCES substations(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (project_name, device_id)
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_substations_project_name
          ON substations(project_name);
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_device_substation_mappings_substation_id
          ON device_substation_mappings(substation_id);
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS main_intakes (
          id BIGSERIAL PRIMARY KEY,
          project_name TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (project_name, name)
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS device_main_intake_mappings (
          project_name TEXT NOT NULL,
          device_id TEXT NOT NULL,
          main_intake_id BIGINT NOT NULL REFERENCES main_intakes(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (project_name, device_id)
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_main_intakes_project_name
          ON main_intakes(project_name);
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_device_main_intake_mappings_main_intake_id
          ON device_main_intake_mappings(main_intake_id);
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS device_labels (
          project_name TEXT NOT NULL,
          device_id TEXT NOT NULL,
          label TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (project_name, device_id)
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_device_labels_project_name
          ON device_labels(project_name);
      `);
    })().catch((error) => {
      dbInitPromise = null;
      throw error;
    });
  }
  return dbInitPromise;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    throw new Error("Request body must be valid JSON.");
  }
}

function parsePathSegments(pathname, prefix) {
  return pathname
    .slice(prefix.length)
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
}

function normalizeProjectSubstationPayload(
  projectName,
  substations,
  assignments,
  deviceLabels,
  mainIntakes,
  mainIntakeAssignments
) {
  return {
    projectName,
    substations: (Array.isArray(substations) ? substations : []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      projectName: String(row.project_name || projectName),
    })),
    deviceAssignments: (Array.isArray(assignments) ? assignments : []).map((row) => ({
      deviceId: String(row.device_id),
      substationId: String(row.substation_id),
    })),
    deviceLabels: (Array.isArray(deviceLabels) ? deviceLabels : []).map((row) => ({
      deviceId: String(row.device_id),
      label: String(row.label),
    })),
    mainIntakes: (Array.isArray(mainIntakes) ? mainIntakes : []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      projectName: String(row.project_name || projectName),
    })),
    mainIntakeAssignments: (Array.isArray(mainIntakeAssignments) ? mainIntakeAssignments : []).map((row) => ({
      deviceId: String(row.device_id),
      mainIntakeId: String(row.main_intake_id),
    })),
  };
}

async function fetchProjectSubstationConfig(projectName) {
  if (useLocalMetadataStore()) {
    return fetchLocalProjectSubstationConfig(projectName);
  }

  await initializeDatabase();
  const pool = getDbPool();
  const safeProjectName = String(projectName || "").trim();
  const [substationResult, assignmentResult, labelResult, mainIntakeResult, mainIntakeAssignmentResult] = await Promise.all([
    pool.query(
      `
        SELECT id, name, project_name
        FROM substations
        WHERE project_name = $1
        ORDER BY LOWER(name), name, id;
      `,
      [safeProjectName]
    ),
    pool.query(
      `
        SELECT device_id, substation_id
        FROM device_substation_mappings
        WHERE project_name = $1
        ORDER BY device_id;
      `,
      [safeProjectName]
    ),
    pool.query(
      `
        SELECT device_id, label
        FROM device_labels
        WHERE project_name = $1
        ORDER BY device_id;
      `,
      [safeProjectName]
    ),
    pool.query(
      `
        SELECT id, name, project_name
        FROM main_intakes
        WHERE project_name = $1
        ORDER BY LOWER(name), name, id;
      `,
      [safeProjectName]
    ),
    pool.query(
      `
        SELECT device_id, main_intake_id
        FROM device_main_intake_mappings
        WHERE project_name = $1
        ORDER BY device_id;
      `,
      [safeProjectName]
    ),
  ]);

  return normalizeProjectSubstationPayload(
    safeProjectName,
    substationResult.rows,
    assignmentResult.rows,
    labelResult.rows,
    mainIntakeResult.rows,
    mainIntakeAssignmentResult.rows
  );
}

async function createSubstation(projectName, name) {
  const safeProjectName = String(projectName || "").trim();
  const safeName = String(name || "").trim();
  if (!safeProjectName) {
    throw new Error("Project name is required.");
  }
  if (!safeName) {
    throw new Error("Substation name is required.");
  }

  if (useLocalMetadataStore()) {
    return withLocalMetadataStore((store) => {
      const exists = store.substations.some(
        (row) => row.project_name === safeProjectName && row.name === safeName
      );
      if (!exists) {
        store.substations.push({
          id: getNextLocalId(store.substations),
          project_name: safeProjectName,
          name: safeName,
          created_at: new Date().toISOString(),
        });
      }
      return buildLocalProjectPayload(safeProjectName, store);
    });
  }

  await initializeDatabase();
  const pool = getDbPool();
  await pool.query(
    `
      INSERT INTO substations (project_name, name)
      VALUES ($1, $2)
      ON CONFLICT (project_name, name) DO NOTHING;
    `,
    [safeProjectName, safeName]
  );

  return fetchProjectSubstationConfig(safeProjectName);
}

async function deleteSubstation(projectName, substationId) {
  const safeProjectName = String(projectName || "").trim();
  const safeSubstationId = String(substationId || "").trim();
  if (!safeProjectName || !safeSubstationId) {
    throw new Error("Project name and substation ID are required.");
  }

  if (useLocalMetadataStore()) {
    return withLocalMetadataStore((store) => {
      store.substations = store.substations.filter(
        (row) => !(row.project_name === safeProjectName && String(row.id) === safeSubstationId)
      );
      store.deviceSubstationMappings = store.deviceSubstationMappings.filter(
        (row) =>
          !(row.project_name === safeProjectName && String(row.substation_id) === safeSubstationId)
      );
      return buildLocalProjectPayload(safeProjectName, store);
    });
  }

  await initializeDatabase();
  const pool = getDbPool();
  await pool.query(
    `
      DELETE FROM substations
      WHERE project_name = $1 AND id = $2::bigint;
    `,
    [safeProjectName, safeSubstationId]
  );

  return fetchProjectSubstationConfig(safeProjectName);
}

async function updateDeviceSubstationMappings(projectName, deviceIds, substationId) {
  const safeProjectName = String(projectName || "").trim();
  const safeDeviceIds = Array.from(
    new Set(
      (Array.isArray(deviceIds) ? deviceIds : [])
        .map((deviceId) => String(deviceId || "").trim())
        .filter(Boolean)
    )
  );
  const safeSubstationId = String(substationId || "").trim();

  if (!safeProjectName) {
    throw new Error("Project name is required.");
  }
  if (!safeDeviceIds.length) {
    throw new Error("At least one device ID is required.");
  }

  if (useLocalMetadataStore()) {
    return withLocalMetadataStore((store) => {
      if (safeSubstationId) {
        const substationExists = store.substations.some(
          (row) => row.project_name === safeProjectName && String(row.id) === safeSubstationId
        );
        if (!substationExists) {
          throw new Error("Selected substation does not exist for this project.");
        }

        safeDeviceIds.forEach((deviceId) => {
          const existing = store.deviceSubstationMappings.find(
            (row) => row.project_name === safeProjectName && row.device_id === deviceId
          );
          if (existing) {
            existing.substation_id = safeSubstationId;
            existing.updated_at = new Date().toISOString();
          } else {
            const now = new Date().toISOString();
            store.deviceSubstationMappings.push({
              project_name: safeProjectName,
              device_id: deviceId,
              substation_id: safeSubstationId,
              created_at: now,
              updated_at: now,
            });
          }
        });
      } else {
        const deviceSet = new Set(safeDeviceIds);
        store.deviceSubstationMappings = store.deviceSubstationMappings.filter(
          (row) => !(row.project_name === safeProjectName && deviceSet.has(row.device_id))
        );
      }
      return buildLocalProjectPayload(safeProjectName, store);
    });
  }

  await initializeDatabase();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (safeSubstationId) {
      const substationResult = await client.query(
        `
          SELECT id
          FROM substations
          WHERE project_name = $1 AND id = $2::bigint;
        `,
        [safeProjectName, safeSubstationId]
      );
      if (!substationResult.rows.length) {
        throw new Error("Selected substation does not exist for this project.");
      }

      for (const deviceId of safeDeviceIds) {
        await client.query(
          `
            INSERT INTO device_substation_mappings (project_name, device_id, substation_id)
            VALUES ($1, $2, $3::bigint)
            ON CONFLICT (project_name, device_id)
            DO UPDATE SET
              substation_id = EXCLUDED.substation_id,
              updated_at = NOW();
          `,
          [safeProjectName, deviceId, safeSubstationId]
        );
      }
    } else {
      await client.query(
        `
          DELETE FROM device_substation_mappings
          WHERE project_name = $1 AND device_id = ANY($2::text[]);
        `,
        [safeProjectName, safeDeviceIds]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return fetchProjectSubstationConfig(safeProjectName);
}

async function updateDeviceLabel(projectName, deviceId, label) {
  const safeProjectName = String(projectName || "").trim();
  const safeDeviceId = String(deviceId || "").trim();
  const safeLabel = String(label || "").trim();

  if (!safeProjectName) {
    throw new Error("Project name is required.");
  }
  if (!safeDeviceId) {
    throw new Error("Device ID is required.");
  }

  if (useLocalMetadataStore()) {
    return withLocalMetadataStore((store) => {
      const existing = store.deviceLabels.find(
        (row) => row.project_name === safeProjectName && row.device_id === safeDeviceId
      );
      if (safeLabel) {
        if (existing) {
          existing.label = safeLabel;
          existing.updated_at = new Date().toISOString();
        } else {
          const now = new Date().toISOString();
          store.deviceLabels.push({
            project_name: safeProjectName,
            device_id: safeDeviceId,
            label: safeLabel,
            created_at: now,
            updated_at: now,
          });
        }
      } else {
        store.deviceLabels = store.deviceLabels.filter(
          (row) => !(row.project_name === safeProjectName && row.device_id === safeDeviceId)
        );
      }
      return buildLocalProjectPayload(safeProjectName, store);
    });
  }

  await initializeDatabase();
  const pool = getDbPool();
  if (safeLabel) {
    await pool.query(
      `
        INSERT INTO device_labels (project_name, device_id, label)
        VALUES ($1, $2, $3)
        ON CONFLICT (project_name, device_id)
        DO UPDATE SET
          label = EXCLUDED.label,
          updated_at = NOW();
      `,
      [safeProjectName, safeDeviceId, safeLabel]
    );
  } else {
    await pool.query(
      `
        DELETE FROM device_labels
        WHERE project_name = $1 AND device_id = $2;
      `,
      [safeProjectName, safeDeviceId]
    );
  }

  return fetchProjectSubstationConfig(safeProjectName);
}

async function createMainIntake(projectName, name) {
  const safeProjectName = String(projectName || "").trim();
  const safeName = String(name || "").trim();

  if (!safeProjectName) {
    throw new Error("Project name is required.");
  }
  if (!safeName) {
    throw new Error("Main intake name is required.");
  }

  if (useLocalMetadataStore()) {
    return withLocalMetadataStore((store) => {
      const exists = store.mainIntakes.some(
        (row) => row.project_name === safeProjectName && row.name === safeName
      );
      if (!exists) {
        store.mainIntakes.push({
          id: getNextLocalId(store.mainIntakes),
          project_name: safeProjectName,
          name: safeName,
          created_at: new Date().toISOString(),
        });
      }
      return buildLocalProjectPayload(safeProjectName, store);
    });
  }

  await initializeDatabase();
  const pool = getDbPool();
  await pool.query(
    `
      INSERT INTO main_intakes (project_name, name)
      VALUES ($1, $2)
      ON CONFLICT (project_name, name) DO NOTHING;
    `,
    [safeProjectName, safeName]
  );

  return fetchProjectSubstationConfig(safeProjectName);
}

async function deleteMainIntake(projectName, mainIntakeId) {
  const safeProjectName = String(projectName || "").trim();
  const safeMainIntakeId = String(mainIntakeId || "").trim();
  if (!safeProjectName || !safeMainIntakeId) {
    throw new Error("Project name and main intake ID are required.");
  }

  if (useLocalMetadataStore()) {
    return withLocalMetadataStore((store) => {
      store.mainIntakes = store.mainIntakes.filter(
        (row) => !(row.project_name === safeProjectName && String(row.id) === safeMainIntakeId)
      );
      store.deviceMainIntakeMappings = store.deviceMainIntakeMappings.filter(
        (row) =>
          !(row.project_name === safeProjectName && String(row.main_intake_id) === safeMainIntakeId)
      );
      return buildLocalProjectPayload(safeProjectName, store);
    });
  }

  await initializeDatabase();
  const pool = getDbPool();
  await pool.query(
    `
      DELETE FROM main_intakes
      WHERE project_name = $1 AND id = $2::bigint;
    `,
    [safeProjectName, safeMainIntakeId]
  );

  return fetchProjectSubstationConfig(safeProjectName);
}

async function updateDeviceMainIntakeMappings(projectName, deviceIds, mainIntakeId) {
  const safeProjectName = String(projectName || "").trim();
  const safeDeviceIds = Array.from(
    new Set(
      (Array.isArray(deviceIds) ? deviceIds : [])
        .map((deviceId) => String(deviceId || "").trim())
        .filter(Boolean)
    )
  );
  const safeMainIntakeId = String(mainIntakeId || "").trim();

  if (!safeProjectName) {
    throw new Error("Project name is required.");
  }
  if (!safeDeviceIds.length) {
    throw new Error("At least one device ID is required.");
  }

  if (useLocalMetadataStore()) {
    return withLocalMetadataStore((store) => {
      if (safeMainIntakeId) {
        const mainIntakeExists = store.mainIntakes.some(
          (row) => row.project_name === safeProjectName && String(row.id) === safeMainIntakeId
        );
        if (!mainIntakeExists) {
          throw new Error("Selected main intake does not exist for this project.");
        }

        safeDeviceIds.forEach((deviceId) => {
          const existing = store.deviceMainIntakeMappings.find(
            (row) => row.project_name === safeProjectName && row.device_id === deviceId
          );
          if (existing) {
            existing.main_intake_id = safeMainIntakeId;
            existing.updated_at = new Date().toISOString();
          } else {
            const now = new Date().toISOString();
            store.deviceMainIntakeMappings.push({
              project_name: safeProjectName,
              device_id: deviceId,
              main_intake_id: safeMainIntakeId,
              created_at: now,
              updated_at: now,
            });
          }
        });
      } else {
        const deviceSet = new Set(safeDeviceIds);
        store.deviceMainIntakeMappings = store.deviceMainIntakeMappings.filter(
          (row) => !(row.project_name === safeProjectName && deviceSet.has(row.device_id))
        );
      }
      return buildLocalProjectPayload(safeProjectName, store);
    });
  }

  await initializeDatabase();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (safeMainIntakeId) {
      const mainIntakeResult = await client.query(
        `
          SELECT id
          FROM main_intakes
          WHERE project_name = $1 AND id = $2::bigint;
        `,
        [safeProjectName, safeMainIntakeId]
      );
      if (!mainIntakeResult.rows.length) {
        throw new Error("Selected main intake does not exist for this project.");
      }

      for (const deviceId of safeDeviceIds) {
        await client.query(
          `
            INSERT INTO device_main_intake_mappings (project_name, device_id, main_intake_id)
            VALUES ($1, $2, $3::bigint)
            ON CONFLICT (project_name, device_id)
            DO UPDATE SET
              main_intake_id = EXCLUDED.main_intake_id,
              updated_at = NOW();
          `,
          [safeProjectName, deviceId, safeMainIntakeId]
        );
      }
    } else {
      await client.query(
        `
          DELETE FROM device_main_intake_mappings
          WHERE project_name = $1 AND device_id = ANY($2::text[]);
        `,
        [safeProjectName, safeDeviceIds]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return fetchProjectSubstationConfig(safeProjectName);
}

async function handleAppApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const segments = parsePathSegments(url.pathname, APP_API_PREFIX);

  if (segments.length === 3 && segments[0] === "projects" && segments[2] === "substations") {
    const projectName = segments[1];
    if (req.method === "GET") {
      sendJson(res, 200, await fetchProjectSubstationConfig(projectName));
      return;
    }
    if (req.method === "POST") {
      const body = await readJsonBody(req);
      sendJson(res, 201, await createSubstation(projectName, body?.name));
      return;
    }
  }

  if (
    segments.length === 4 &&
    segments[0] === "projects" &&
    segments[2] === "substations" &&
    req.method === "DELETE"
  ) {
    sendJson(res, 200, await deleteSubstation(segments[1], segments[3]));
    return;
  }

  if (
    segments.length === 3 &&
    segments[0] === "projects" &&
    segments[2] === "device-substations" &&
    req.method === "PUT"
  ) {
    const body = await readJsonBody(req);
    sendJson(
      res,
      200,
      await updateDeviceSubstationMappings(segments[1], body?.deviceIds, body?.substationId)
    );
    return;
  }

  if (
    segments.length === 3 &&
    segments[0] === "projects" &&
    segments[2] === "device-labels" &&
    req.method === "PUT"
  ) {
    const body = await readJsonBody(req);
    sendJson(
      res,
      200,
      await updateDeviceLabel(segments[1], body?.deviceId, body?.label)
    );
    return;
  }

  if (
    segments.length === 3 &&
    segments[0] === "projects" &&
    segments[2] === "main-intakes" &&
    req.method === "POST"
  ) {
    const body = await readJsonBody(req);
    sendJson(
      res,
      201,
      await createMainIntake(segments[1], body?.name)
    );
    return;
  }

  if (
    segments.length === 4 &&
    segments[0] === "projects" &&
    segments[2] === "main-intakes" &&
    req.method === "DELETE"
  ) {
    sendJson(res, 200, await deleteMainIntake(segments[1], segments[3]));
    return;
  }

  if (
    segments.length === 3 &&
    segments[0] === "projects" &&
    segments[2] === "main-intakes" &&
    req.method === "PUT"
  ) {
    const body = await readJsonBody(req);
    sendJson(
      res,
      200,
      await updateDeviceMainIntakeMappings(segments[1], body?.deviceIds, body?.mainIntakeId)
    );
    return;
  }

  send(res, 404, "App API route not found.");
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    send(res, 400, "Bad request");
    return;
  }

  try {
    if (req.url.startsWith(`${APP_API_PREFIX}/`)) {
      await handleAppApi(req, res);
      return;
    }

    if (req.url.startsWith("/rest/")) {
      await proxyApi(req, res);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, "Method not allowed");
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    send(res, 500, error.message || "Unexpected server error.");
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Proxying /rest/* to ${API_ORIGIN}/rest/*`);
  console.log(
    useLocalMetadataStore()
      ? `Serving app persistence endpoints at ${APP_API_PREFIX}/* using ${LOCAL_METADATA_PATH}`
      : `Serving app persistence endpoints at ${APP_API_PREFIX}/* using Postgres`
  );
});
