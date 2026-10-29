const os = require("os");
const path = require("path");

const { createReportServer } = require("./lib/server-app");

loadEnvironmentFile(process.env.SERVICE_ENV_FILE);

const PORT = Number(process.env.PORT || 8081);
const API_ORIGIN = process.env.API_ORIGIN || "http://gridvisdemo.site:8080";
const STATIC_ROOT = process.cwd();
const metadataPath = resolveMetadataPath(STATIC_ROOT);
const upstreamHeaders = getUpstreamHeaders();

const server = createReportServer({
  apiOrigin: API_ORIGIN,
  staticRoot: STATIC_ROOT,
  metadataPath,
  username: process.env.REPORT_USERNAME,
  passwordHash: process.env.REPORT_PASSWORD_HASH,
  trustProxyHttps: process.env.TRUST_PROXY_HTTPS === "true",
  upstreamHeaders,
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Proxying /rest/* to ${new URL("/rest/", API_ORIGIN)}`);
  console.log(`Serving app configuration from ${metadataPath}`);
});

let shutdownStarted = false;
function shutdown(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  console.log(`Received ${signal}. Shutting down...`);
  const timeout = setTimeout(() => {
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    process.exit(1);
  }, 15000);
  timeout.unref();
  server.close((error) => {
    clearTimeout(timeout);
    process.exit(error ? 1 : 0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function loadEnvironmentFile(filePath) {
  const safePath = String(filePath || "").trim();
  if (!safePath) return;
  let contents;
  try {
    contents = require("fs").readFileSync(path.resolve(safePath), "utf8");
  } catch (error) {
    throw new Error(`Unable to load service environment file "${safePath}": ${error.message}`);
  }
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) return;
    const key = trimmed.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) return;
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

function resolveMetadataPath(staticRoot) {
  const configured = String(process.env.APP_METADATA_PATH || "").trim();
  if (configured) return path.isAbsolute(configured) ? configured : path.resolve(staticRoot, configured);
  return path.join(os.homedir(), ".custom-report-generator", "app-metadata.json");
}

function getUpstreamHeaders() {
  const headers = {};
  const authorization = String(process.env.API_AUTH_HEADER || "").trim();
  const bearer = String(process.env.API_BEARER_TOKEN || "").trim();
  const username = String(process.env.API_USERNAME || "").trim();
  if (authorization) headers.authorization = authorization;
  else if (bearer) headers.authorization = `Bearer ${bearer}`;
  else if (username) {
    headers.authorization = `Basic ${Buffer.from(`${username}:${process.env.API_PASSWORD || ""}`, "utf8").toString("base64")}`;
  }
  const cookie = String(process.env.API_COOKIE || "").trim();
  if (cookie) headers.cookie = cookie;
  return headers;
}
