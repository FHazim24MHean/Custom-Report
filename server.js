const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");

loadEnvironmentFile(process.env.SERVICE_ENV_FILE);

const PORT = Number(process.env.PORT || 5500);
const API_ORIGIN = process.env.API_ORIGIN || "http://gridvisdemo.site:8080";
const STATIC_ROOT = process.cwd();
const APP_API_PREFIX = "/app-api";
const LOCAL_METADATA_PATH = resolveLocalMetadataPath();
const REPORT_USERNAME = String(process.env.REPORT_USERNAME || "").trim();
const REPORT_PASSWORD_HASH = String(process.env.REPORT_PASSWORD_HASH || "").trim();
const SESSION_COOKIE = "report_session";
const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;
const REPORT_LINK_RANGES = new Set([
  "today",
  "yesterday",
  "last7",
  "last30",
  "last365",
  "lastyear",
  "custom",
]);
const REPORT_LINK_TYPES = new Set(["histvalues", "hist-events"]);
const sessions = new Map();
const loginAttempts = new Map();

if (!REPORT_USERNAME || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/i.test(REPORT_PASSWORD_HASH)) {
  throw new Error("Set REPORT_USERNAME and a valid REPORT_PASSWORD_HASH before starting the report service.");
}

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

function loadEnvironmentFile(filePath) {
  const safePath = String(filePath || "").trim();
  if (!safePath) {
    return;
  }

  let contents;
  try {
    contents = fs.readFileSync(path.resolve(safePath), "utf8");
  } catch (error) {
    throw new Error(`Unable to load service environment file "${safePath}": ${error.message}`);
  }

  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      return;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) {
      return;
    }
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

function send(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function getCookie(req, name) {
  const pair = String(req.headers.cookie || "")
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return pair ? pair.slice(name.length + 1) : "";
}

function isSecureRequest(req) {
  return Boolean(req.socket.encrypted) ||
    (process.env.TRUST_PROXY_HTTPS === "true" && req.headers["x-forwarded-proto"] === "https");
}

function sessionCookie(req, token = "") {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (!token) parts.push("Max-Age=0");
  if (isSecureRequest(req)) parts.push("Secure");
  return parts.join("; ");
}

function currentSession(req) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.lastSeen > SESSION_IDLE_MS) {
    sessions.delete(token);
    return null;
  }
  session.lastSeen = Date.now();
  return session;
}

function verifyReportPassword(password) {
  const [, salt, expectedHash] = REPORT_PASSWORD_HASH.split(":");
  const actualHash = crypto.scryptSync(String(password || ""), Buffer.from(salt, "hex"), 64);
  return crypto.timingSafeEqual(actualHash, Buffer.from(expectedHash, "hex"));
}

function hasMatchingOrigin(req) {
  const origin = String(req.headers.origin || "");
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.host &&
      new URL(origin).protocol === (isSecureRequest(req) ? "https:" : "http:");
  } catch (_error) {
    return false;
  }
}

async function handleReportLogin(req, res) {
  if (req.method !== "POST" || !hasMatchingOrigin(req)) {
    send(res, 403, "Forbidden");
    return;
  }
  const ip = req.socket.remoteAddress || "unknown";
  const attempt = loginAttempts.get(ip);
  if (attempt && attempt.until > Date.now()) {
    sendJson(res, 429, { error: "Too many attempts. Try again later." });
    return;
  }
  let body;
  try {
    body = await readJsonBody(req);
  } catch (_error) {
    sendJson(res, 400, { error: "Invalid request." });
    return;
  }
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  if (username.length > 256 || password.length > 1024) {
    sendJson(res, 400, { error: "Invalid credentials." });
    return;
  }
  const valid = username === REPORT_USERNAME && verifyReportPassword(password);
  if (!valid) {
    const failures = (attempt?.failures || 0) + 1;
    loginAttempts.set(ip, {
      failures,
      until: failures >= 5 ? Date.now() + 15 * 60 * 1000 : 0,
    });
    sendJson(res, 401, { error: "Invalid username or password." });
    return;
  }
  loginAttempts.delete(ip);
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { username, lastSeen: Date.now() });
  res.setHeader("Set-Cookie", sessionCookie(req, token));
  sendJson(res, 200, { username });
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

function resolveLocalMetadataPath() {
  const configuredPath = String(process.env.APP_METADATA_PATH || "").trim();
  if (configuredPath) {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(STATIC_ROOT, configuredPath);
  }
  return path.join(os.homedir(), ".custom-report-generator", "app-metadata.json");
}

function getUpstreamAuthHeaders() {
  const explicitAuthorization = String(process.env.API_AUTH_HEADER || "").trim();
  if (explicitAuthorization) {
    return {
      Authorization: explicitAuthorization,
    };
  }

  const bearerToken = String(process.env.API_BEARER_TOKEN || "").trim();
  if (bearerToken) {
    return {
      Authorization: `Bearer ${bearerToken}`,
    };
  }

  const username = String(process.env.API_USERNAME || "").trim();
  const password = String(process.env.API_PASSWORD || "");
  if (username) {
    const encoded = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
    return {
      Authorization: `Basic ${encoded}`,
    };
  }

  return {};
}

function getUpstreamExtraHeaders() {
  const headers = {};
  const cookieHeader = String(process.env.API_COOKIE || "").trim();
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }
  return headers;
}

function serveStatic(req, res, pathnameOverride = "") {
  let pathname = pathnameOverride || new URL(req.url, `http://${req.headers.host}`).pathname;
  if (pathname === "/") pathname = "/index.html";

  if (!["/index.html", "/app.js", "/styles.css", "/login.html", "/login.js", "/login.css"].includes(pathname)) {
    send(res, 404, "Not found");
    return;
  }

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
    res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
    fs.createReadStream(filePath).pipe(res);
  });
}

async function proxyApi(req, res) {
  const targetUrl = new URL(req.url, API_ORIGIN);
  const incomingHeaders = { ...req.headers };
  delete incomingHeaders.host;
  delete incomingHeaders.origin;
  delete incomingHeaders.referer;
  delete incomingHeaders.cookie;
  delete incomingHeaders.authorization;

  const upstreamAuthHeaders = getUpstreamAuthHeaders();
  const upstreamExtraHeaders = getUpstreamExtraHeaders();
  const upstreamHeaders = {
    ...incomingHeaders,
    ...upstreamExtraHeaders,
  };
  if (upstreamAuthHeaders.Authorization) {
    upstreamHeaders.authorization = upstreamAuthHeaders.Authorization;
  }
  if (upstreamExtraHeaders.Cookie) {
    upstreamHeaders.cookie = upstreamExtraHeaders.Cookie;
  }

  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = req;
  }

  try {
    const fetchOptions = {
      method: req.method,
      headers: upstreamHeaders,
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
    reportLinks: [],
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
    reportLinks: Array.isArray(safeStore.reportLinks) ? safeStore.reportLinks : [],
  };
}

function normalizeElectricalSide(value) {
  const side = String(value || "").trim().toUpperCase();
  return side === "HT" || side === "LV" ? side : "";
}

function validateElectricalSide(value) {
  const rawSide = String(value || "").trim();
  const side = normalizeElectricalSide(rawSide);
  if (rawSide && !side) {
    throw new Error('Side must be either "HT" or "LV".');
  }
  return side;
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
          side TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (project_name, device_id)
        );
      `);
      await pool.query(`
        ALTER TABLE device_substation_mappings
          ADD COLUMN IF NOT EXISTS side TEXT;
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
          side TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (project_name, device_id)
        );
      `);
      await pool.query(`
        ALTER TABLE device_main_intake_mappings
          ADD COLUMN IF NOT EXISTS side TEXT;
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
      await pool.query(`
        CREATE TABLE IF NOT EXISTS report_links (
          id BIGSERIAL PRIMARY KEY,
          slug TEXT NOT NULL UNIQUE,
          project_name TEXT NOT NULL,
          group_type TEXT NOT NULL CHECK (group_type IN ('substation', 'main-intake')),
          group_id BIGINT NOT NULL,
          side TEXT NOT NULL CHECK (side IN ('HT', 'LV')),
          date_range TEXT NOT NULL DEFAULT 'today',
          start_date DATE,
          end_date DATE,
          report_type TEXT NOT NULL DEFAULT 'histvalues',
          autorun BOOLEAN NOT NULL DEFAULT TRUE,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_report_links_project_name
          ON report_links(project_name);
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
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) {
      throw new Error("Request body exceeds 1 MB.");
    }
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

function parseShortReportSlug(pathname) {
  const match = String(pathname || "").match(/^\/r\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : "";
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
      side: normalizeElectricalSide(row.side),
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
      side: normalizeElectricalSide(row.side),
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
        SELECT device_id, substation_id, side
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
        SELECT device_id, main_intake_id, side
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
      store.reportLinks = store.reportLinks.filter(
        (row) =>
          !(
            row.project_name === safeProjectName &&
            row.group_type === "substation" &&
            String(row.group_id) === safeSubstationId
          )
      );
      return buildLocalProjectPayload(safeProjectName, store);
    });
  }

  await initializeDatabase();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
        DELETE FROM report_links
        WHERE project_name = $1 AND group_type = 'substation' AND group_id = $2::bigint;
      `,
      [safeProjectName, safeSubstationId]
    );
    await client.query(
      `
        DELETE FROM substations
        WHERE project_name = $1 AND id = $2::bigint;
      `,
      [safeProjectName, safeSubstationId]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return fetchProjectSubstationConfig(safeProjectName);
}

async function updateDeviceSubstationMappings(projectName, deviceIds, substationId, side) {
  const safeProjectName = String(projectName || "").trim();
  const safeDeviceIds = Array.from(
    new Set(
      (Array.isArray(deviceIds) ? deviceIds : [])
        .map((deviceId) => String(deviceId || "").trim())
        .filter(Boolean)
    )
  );
  const safeSubstationId = String(substationId || "").trim();
  const safeSide = validateElectricalSide(side);

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
            existing.side = safeSide;
            existing.updated_at = new Date().toISOString();
          } else {
            const now = new Date().toISOString();
            store.deviceSubstationMappings.push({
              project_name: safeProjectName,
              device_id: deviceId,
              substation_id: safeSubstationId,
              side: safeSide,
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
            INSERT INTO device_substation_mappings (project_name, device_id, substation_id, side)
            VALUES ($1, $2, $3::bigint, $4)
            ON CONFLICT (project_name, device_id)
            DO UPDATE SET
              substation_id = EXCLUDED.substation_id,
              side = EXCLUDED.side,
              updated_at = NOW();
          `,
          [safeProjectName, deviceId, safeSubstationId, safeSide || null]
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
      store.reportLinks = store.reportLinks.filter(
        (row) =>
          !(
            row.project_name === safeProjectName &&
            row.group_type === "main-intake" &&
            String(row.group_id) === safeMainIntakeId
          )
      );
      return buildLocalProjectPayload(safeProjectName, store);
    });
  }

  await initializeDatabase();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
        DELETE FROM report_links
        WHERE project_name = $1 AND group_type = 'main-intake' AND group_id = $2::bigint;
      `,
      [safeProjectName, safeMainIntakeId]
    );
    await client.query(
      `
        DELETE FROM main_intakes
        WHERE project_name = $1 AND id = $2::bigint;
      `,
      [safeProjectName, safeMainIntakeId]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return fetchProjectSubstationConfig(safeProjectName);
}

async function updateDeviceMainIntakeMappings(projectName, deviceIds, mainIntakeId, side) {
  const safeProjectName = String(projectName || "").trim();
  const safeDeviceIds = Array.from(
    new Set(
      (Array.isArray(deviceIds) ? deviceIds : [])
        .map((deviceId) => String(deviceId || "").trim())
        .filter(Boolean)
    )
  );
  const safeMainIntakeId = String(mainIntakeId || "").trim();
  const safeSide = validateElectricalSide(side);

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
            existing.side = safeSide;
            existing.updated_at = new Date().toISOString();
          } else {
            const now = new Date().toISOString();
            store.deviceMainIntakeMappings.push({
              project_name: safeProjectName,
              device_id: deviceId,
              main_intake_id: safeMainIntakeId,
              side: safeSide,
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
            INSERT INTO device_main_intake_mappings (project_name, device_id, main_intake_id, side)
            VALUES ($1, $2, $3::bigint, $4)
            ON CONFLICT (project_name, device_id)
            DO UPDATE SET
              main_intake_id = EXCLUDED.main_intake_id,
              side = EXCLUDED.side,
              updated_at = NOW();
          `,
          [safeProjectName, deviceId, safeMainIntakeId, safeSide || null]
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

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeReportLinkSlug(value) {
  const slug = String(value || "").trim().toLowerCase();
  if (!slug || slug.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw createHttpError(
      400,
      "Link name must be 1-64 lowercase letters or numbers separated by single hyphens."
    );
  }
  return slug;
}

function normalizeDateOnly(value, fieldName) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw createHttpError(400, `${fieldName} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw createHttpError(400, `${fieldName} is not a valid date.`);
  }
  return text;
}

function normalizeReportLinkInput(input) {
  const projectName = String(input?.projectName || "").trim();
  const groupType = String(input?.groupType || "").trim().toLowerCase();
  const groupId = String(input?.groupId || "").trim();
  const side = normalizeElectricalSide(input?.side);
  const dateRange = String(input?.range || "today").trim().toLowerCase();
  const reportType = String(input?.reportType || "histvalues").trim().toLowerCase();

  if (!projectName || projectName.length > 256) {
    throw createHttpError(400, "Project is required.");
  }
  if (!['substation', 'main-intake'].includes(groupType)) {
    throw createHttpError(400, 'Group type must be "substation" or "main-intake".');
  }
  if (!/^\d+$/.test(groupId)) {
    throw createHttpError(400, "A valid group is required.");
  }
  if (!side) {
    throw createHttpError(400, 'Side must be either "HT" or "LV".');
  }
  if (!REPORT_LINK_RANGES.has(dateRange)) {
    throw createHttpError(400, "The selected report range is not supported.");
  }
  if (!REPORT_LINK_TYPES.has(reportType)) {
    throw createHttpError(400, "The selected report type is not supported.");
  }

  let startDate = null;
  let endDate = null;
  if (dateRange === "custom") {
    startDate = normalizeDateOnly(input?.startDate, "Start date");
    endDate = normalizeDateOnly(input?.endDate, "End date");
    if (startDate > endDate) {
      throw createHttpError(400, "Start date must not be after end date.");
    }
  }

  return {
    slug: normalizeReportLinkSlug(input?.slug),
    projectName,
    groupType,
    groupId,
    side,
    range: dateRange,
    startDate,
    endDate,
    reportType,
    autorun: input?.autorun === undefined ? true : Boolean(input.autorun),
    enabled: input?.enabled === undefined ? true : Boolean(input.enabled),
  };
}

function formatDatabaseDate(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function normalizeReportLinkRow(row, groupName = "") {
  return {
    id: String(row.id),
    slug: String(row.slug),
    projectName: String(row.project_name),
    groupType: String(row.group_type),
    groupId: String(row.group_id),
    groupName: String(groupName || row.group_name || ""),
    side: normalizeElectricalSide(row.side),
    range: String(row.date_range || "today"),
    startDate: formatDatabaseDate(row.start_date),
    endDate: formatDatabaseDate(row.end_date),
    reportType: String(row.report_type || "histvalues"),
    autorun: Boolean(row.autorun),
    enabled: Boolean(row.enabled),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function findLocalReportLinkGroup(store, link) {
  const rows = link.groupType === "main-intake" ? store.mainIntakes : store.substations;
  return rows.find(
    (row) =>
      String(row?.project_name || "") === link.projectName &&
      String(row?.id || "") === link.groupId
  ) || null;
}

async function findDatabaseReportLinkGroup(pool, link) {
  const tableName = link.groupType === "main-intake" ? "main_intakes" : "substations";
  const result = await pool.query(
    `SELECT id, name FROM ${tableName} WHERE project_name = $1 AND id = $2::bigint;`,
    [link.projectName, link.groupId]
  );
  return result.rows[0] || null;
}

async function listReportLinksForProject(projectName) {
  const safeProjectName = String(projectName || "").trim();
  if (!safeProjectName) {
    throw createHttpError(400, "Project is required.");
  }

  if (useLocalMetadataStore()) {
    const store = await readLocalMetadataStore();
    return store.reportLinks
      .filter((row) => String(row?.project_name || "") === safeProjectName)
      .map((row) => {
        const link = normalizeReportLinkRow(row);
        const group = findLocalReportLinkGroup(store, link);
        return normalizeReportLinkRow(row, group?.name);
      })
      .sort((left, right) => left.slug.localeCompare(right.slug));
  }

  await initializeDatabase();
  const result = await getDbPool().query(
    `
      SELECT rl.*, COALESCE(s.name, mi.name) AS group_name
      FROM report_links rl
      LEFT JOIN substations s
        ON rl.group_type = 'substation'
        AND s.project_name = rl.project_name
        AND s.id = rl.group_id
      LEFT JOIN main_intakes mi
        ON rl.group_type = 'main-intake'
        AND mi.project_name = rl.project_name
        AND mi.id = rl.group_id
      WHERE rl.project_name = $1
      ORDER BY LOWER(rl.slug), rl.slug;
    `,
    [safeProjectName]
  );
  return result.rows.map((row) => normalizeReportLinkRow(row));
}

async function fetchReportLinkBySlug(slug, { includeDisabled = false } = {}) {
  const safeSlug = normalizeReportLinkSlug(slug);
  if (useLocalMetadataStore()) {
    const store = await readLocalMetadataStore();
    const row = store.reportLinks.find((item) => String(item?.slug || "") === safeSlug);
    if (!row || (!includeDisabled && !row.enabled)) {
      throw createHttpError(404, "Report link not found.");
    }
    const link = normalizeReportLinkRow(row);
    const group = findLocalReportLinkGroup(store, link);
    if (!group) {
      throw createHttpError(404, "The group assigned to this report link no longer exists.");
    }
    return normalizeReportLinkRow(row, group.name);
  }

  await initializeDatabase();
  const result = await getDbPool().query(
    `
      SELECT rl.*, COALESCE(s.name, mi.name) AS group_name
      FROM report_links rl
      LEFT JOIN substations s
        ON rl.group_type = 'substation'
        AND s.project_name = rl.project_name
        AND s.id = rl.group_id
      LEFT JOIN main_intakes mi
        ON rl.group_type = 'main-intake'
        AND mi.project_name = rl.project_name
        AND mi.id = rl.group_id
      WHERE rl.slug = $1;
    `,
    [safeSlug]
  );
  const row = result.rows[0];
  if (!row || (!includeDisabled && !row.enabled)) {
    throw createHttpError(404, "Report link not found.");
  }
  if (!row.group_name) {
    throw createHttpError(404, "The group assigned to this report link no longer exists.");
  }
  return normalizeReportLinkRow(row);
}

async function createReportLink(input) {
  const link = normalizeReportLinkInput(input);
  if (useLocalMetadataStore()) {
    return withLocalMetadataStore((store) => {
      if (store.reportLinks.some((row) => String(row?.slug || "") === link.slug)) {
        throw createHttpError(409, `Report link "${link.slug}" already exists.`);
      }
      const group = findLocalReportLinkGroup(store, link);
      if (!group) {
        throw createHttpError(400, "The selected group does not exist for this project.");
      }
      const now = new Date().toISOString();
      const row = {
        id: getNextLocalId(store.reportLinks),
        slug: link.slug,
        project_name: link.projectName,
        group_type: link.groupType,
        group_id: link.groupId,
        side: link.side,
        date_range: link.range,
        start_date: link.startDate,
        end_date: link.endDate,
        report_type: link.reportType,
        autorun: link.autorun,
        enabled: link.enabled,
        created_at: now,
        updated_at: now,
      };
      store.reportLinks.push(row);
      return normalizeReportLinkRow(row, group.name);
    });
  }

  await initializeDatabase();
  const pool = getDbPool();
  const group = await findDatabaseReportLinkGroup(pool, link);
  if (!group) {
    throw createHttpError(400, "The selected group does not exist for this project.");
  }
  try {
    const result = await pool.query(
      `
        INSERT INTO report_links (
          slug, project_name, group_type, group_id, side, date_range,
          start_date, end_date, report_type, autorun, enabled
        )
        VALUES ($1, $2, $3, $4::bigint, $5, $6, $7::date, $8::date, $9, $10, $11)
        RETURNING *;
      `,
      [
        link.slug,
        link.projectName,
        link.groupType,
        link.groupId,
        link.side,
        link.range,
        link.startDate,
        link.endDate,
        link.reportType,
        link.autorun,
        link.enabled,
      ]
    );
    return normalizeReportLinkRow(result.rows[0], group.name);
  } catch (error) {
    if (error.code === "23505") {
      throw createHttpError(409, `Report link "${link.slug}" already exists.`);
    }
    throw error;
  }
}

async function updateReportLink(originalSlug, input) {
  const safeOriginalSlug = normalizeReportLinkSlug(originalSlug);
  const link = normalizeReportLinkInput(input);
  if (useLocalMetadataStore()) {
    return withLocalMetadataStore((store) => {
      const row = store.reportLinks.find((item) => String(item?.slug || "") === safeOriginalSlug);
      if (!row) {
        throw createHttpError(404, "Report link not found.");
      }
      if (
        link.slug !== safeOriginalSlug &&
        store.reportLinks.some((item) => String(item?.slug || "") === link.slug)
      ) {
        throw createHttpError(409, `Report link "${link.slug}" already exists.`);
      }
      const group = findLocalReportLinkGroup(store, link);
      if (!group) {
        throw createHttpError(400, "The selected group does not exist for this project.");
      }
      Object.assign(row, {
        slug: link.slug,
        project_name: link.projectName,
        group_type: link.groupType,
        group_id: link.groupId,
        side: link.side,
        date_range: link.range,
        start_date: link.startDate,
        end_date: link.endDate,
        report_type: link.reportType,
        autorun: link.autorun,
        enabled: link.enabled,
        updated_at: new Date().toISOString(),
      });
      return normalizeReportLinkRow(row, group.name);
    });
  }

  await initializeDatabase();
  const pool = getDbPool();
  const group = await findDatabaseReportLinkGroup(pool, link);
  if (!group) {
    throw createHttpError(400, "The selected group does not exist for this project.");
  }
  try {
    const result = await pool.query(
      `
        UPDATE report_links
        SET slug = $2,
            project_name = $3,
            group_type = $4,
            group_id = $5::bigint,
            side = $6,
            date_range = $7,
            start_date = $8::date,
            end_date = $9::date,
            report_type = $10,
            autorun = $11,
            enabled = $12,
            updated_at = NOW()
        WHERE slug = $1
        RETURNING *;
      `,
      [
        safeOriginalSlug,
        link.slug,
        link.projectName,
        link.groupType,
        link.groupId,
        link.side,
        link.range,
        link.startDate,
        link.endDate,
        link.reportType,
        link.autorun,
        link.enabled,
      ]
    );
    if (!result.rows.length) {
      throw createHttpError(404, "Report link not found.");
    }
    return normalizeReportLinkRow(result.rows[0], group.name);
  } catch (error) {
    if (error.code === "23505") {
      throw createHttpError(409, `Report link "${link.slug}" already exists.`);
    }
    throw error;
  }
}

async function deleteReportLink(slug) {
  const safeSlug = normalizeReportLinkSlug(slug);
  if (useLocalMetadataStore()) {
    return withLocalMetadataStore((store) => {
      const previousLength = store.reportLinks.length;
      store.reportLinks = store.reportLinks.filter(
        (row) => String(row?.slug || "") !== safeSlug
      );
      if (store.reportLinks.length === previousLength) {
        throw createHttpError(404, "Report link not found.");
      }
      return { status: "deleted", slug: safeSlug };
    });
  }

  await initializeDatabase();
  const result = await getDbPool().query(
    "DELETE FROM report_links WHERE slug = $1 RETURNING slug;",
    [safeSlug]
  );
  if (!result.rows.length) {
    throw createHttpError(404, "Report link not found.");
  }
  return { status: "deleted", slug: safeSlug };
}

async function handleAppApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const segments = parsePathSegments(url.pathname, APP_API_PREFIX);

  if (
    segments.length === 3 &&
    segments[0] === "projects" &&
    segments[2] === "report-links"
  ) {
    const projectName = segments[1];
    if (req.method === "GET") {
      sendJson(res, 200, await listReportLinksForProject(projectName));
      return;
    }
    if (req.method === "POST") {
      const body = await readJsonBody(req);
      sendJson(res, 201, await createReportLink({ ...body, projectName }));
      return;
    }
  }

  if (segments.length === 2 && segments[0] === "report-links") {
    const slug = segments[1];
    if (req.method === "GET") {
      sendJson(res, 200, await fetchReportLinkBySlug(slug));
      return;
    }
    if (req.method === "PUT") {
      const body = await readJsonBody(req);
      sendJson(res, 200, await updateReportLink(slug, body));
      return;
    }
    if (req.method === "DELETE") {
      sendJson(res, 200, await deleteReportLink(slug));
      return;
    }
  }

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
      await updateDeviceSubstationMappings(
        segments[1],
        body?.deviceIds,
        body?.substationId,
        body?.side
      )
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
      await updateDeviceMainIntakeMappings(
        segments[1],
        body?.deviceIds,
        body?.mainIntakeId,
        body?.side
      )
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
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const shortReportSlug = parseShortReportSlug(requestUrl.pathname);
    if (requestUrl.pathname === "/auth/login") {
      await handleReportLogin(req, res);
      return;
    }
    if (requestUrl.pathname === "/auth/logout") {
      if (req.method !== "POST" || !hasMatchingOrigin(req)) {
        send(res, 403, "Forbidden");
        return;
      }
      sessions.delete(getCookie(req, SESSION_COOKIE));
      res.setHeader("Set-Cookie", sessionCookie(req));
      sendJson(res, 200, { status: "signed-out" });
      return;
    }
    if (requestUrl.pathname === "/login.html" || requestUrl.pathname === "/login.js" || requestUrl.pathname === "/login.css") {
      if (req.method !== "GET" && req.method !== "HEAD") {
        send(res, 405, "Method not allowed");
        return;
      }
      serveStatic(req, res);
      return;
    }
    if (requestUrl.pathname === "/health" && (req.method === "GET" || req.method === "HEAD")) {
      sendJson(res, 200, {
        status: "ok",
        persistence: useLocalMetadataStore() ? "json" : "postgres",
      });
      return;
    }

    if (!currentSession(req)) {
      if (req.method === "GET" &&
          (requestUrl.pathname === "/" ||
            requestUrl.pathname === "/index.html" ||
            Boolean(shortReportSlug))) {
        res.writeHead(302, {
          Location: `/login.html?next=${encodeURIComponent(req.url)}`,
          "Cache-Control": "no-store",
        });
        res.end();
      } else {
        sendJson(res, 401, { error: "Sign in to access reports." });
      }
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD" && !hasMatchingOrigin(req)) {
      send(res, 403, "Forbidden");
      return;
    }

    if (req.url.startsWith(`${APP_API_PREFIX}/`)) {
      await handleAppApi(req, res);
      return;
    }

    if (req.url.startsWith("/rest/")) {
      await proxyApi(req, res);
      return;
    }

    if (shortReportSlug) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        send(res, 405, "Method not allowed");
        return;
      }
      await fetchReportLinkBySlug(shortReportSlug);
      serveStatic(req, res, "/index.html");
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, "Method not allowed");
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    send(res, statusCode, error.message || "Unexpected server error.");
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

let shutdownStarted = false;

function shutdownServer(signal) {
  if (shutdownStarted) {
    return;
  }
  shutdownStarted = true;
  console.log(`Received ${signal}. Shutting down...`);

  const forceShutdownTimer = setTimeout(() => {
    console.error("Graceful shutdown timed out. Closing remaining connections.");
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    process.exit(1);
  }, 15000);
  forceShutdownTimer.unref();

  server.close(async (serverError) => {
    try {
      if (dbPool) {
        await dbPool.end();
      }
    } catch (databaseError) {
      console.error(`Database shutdown failed: ${databaseError.message}`);
      serverError = serverError || databaseError;
    } finally {
      clearTimeout(forceShutdownTimer);
      process.exit(serverError ? 1 : 0);
    }
  });
}

process.on("SIGINT", () => shutdownServer("SIGINT"));
process.on("SIGTERM", () => shutdownServer("SIGTERM"));
