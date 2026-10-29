const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");

const { MetadataStore } = require("./metadata-store");

const APP_API_PREFIX = "/app-api";
const SESSION_COOKIE = "report_session";
const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};
const ROOT_STATIC_FILES = new Set([
  "/index.html",
  "/app.mjs",
  "/styles.css",
  "/login.html",
  "/login.js",
  "/login.css",
]);

function createReportServer(options) {
  const config = normalizeOptions(options);
  const store = options?.store || new MetadataStore(config.metadataPath);
  const sessions = new Map();
  const loginAttempts = new Map();

  const server = http.createServer(async (req, res) => {
    if (!req.url) return send(res, 400, "Bad request");

    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const shortLinkSlug = parseShortReportSlug(requestUrl.pathname);

      if (requestUrl.pathname === "/auth/login") {
        await handleLogin(req, res, config, sessions, loginAttempts);
        return;
      }
      if (requestUrl.pathname === "/auth/logout") {
        if (req.method !== "POST" || !hasMatchingOrigin(req, config)) return send(res, 403, "Forbidden");
        sessions.delete(getCookie(req, SESSION_COOKIE));
        res.setHeader("Set-Cookie", sessionCookie(req, config));
        return sendJson(res, 200, { status: "signed-out" });
      }
      if (isPublicLoginAsset(requestUrl.pathname)) {
        if (!isReadMethod(req.method)) return send(res, 405, "Method not allowed");
        return serveStatic(req, res, config.staticRoot, requestUrl.pathname);
      }
      if (requestUrl.pathname === "/health" && isReadMethod(req.method)) {
        return sendJson(res, 200, { status: "ok", persistence: "json" });
      }
      if (requestUrl.pathname === "/health/deep" && isReadMethod(req.method)) {
        return handleDeepHealth(res, config, store);
      }

      if (config.requireAuth && !currentSession(req, sessions)) {
        if (req.method === "GET" && (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html" || shortLinkSlug)) {
          res.writeHead(302, {
            Location: `/login.html?next=${encodeURIComponent(req.url)}`,
            "Cache-Control": "no-store",
          });
          return res.end();
        }
        return sendJson(res, 401, { error: "Sign in to access reports." });
      }

      if (!isReadMethod(req.method) && !hasMatchingOrigin(req, config)) return send(res, 403, "Forbidden");
      if (requestUrl.pathname.startsWith(`${APP_API_PREFIX}/`)) return handleAppApi(req, res, requestUrl, store);
      if (requestUrl.pathname.startsWith("/billing-api/")) {
        if (!isReadMethod(req.method)) return send(res, 405, "Billing system access is read-only.");
        return proxyBillingApi(req, res, config);
      }
      if (requestUrl.pathname.startsWith("/rest/")) return proxyApi(req, res, config);

      if (shortLinkSlug) {
        if (!isReadMethod(req.method)) return send(res, 405, "Method not allowed");
        await store.getReportLink(shortLinkSlug, { enabledOnly: true });
        return serveStatic(req, res, config.staticRoot, "/index.html");
      }
      if (!isReadMethod(req.method)) return send(res, 405, "Method not allowed");
      return serveStatic(req, res, config.staticRoot, requestUrl.pathname);
    } catch (error) {
      const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      if (statusCode >= 500) console.error(error);
      return send(res, statusCode, error.message || "Unexpected server error.");
    }
  });

  server.metadataStore = store;
  server.config = config;
  return server;
}

function normalizeOptions(options = {}) {
  const staticRoot = path.resolve(options.staticRoot || process.cwd());
  const apiOrigin = new URL(options.apiOrigin || "http://gridvisdemo.site:8080").origin;
  const billingApiOrigin = new URL(options.billingApiOrigin || "http://127.0.0.1:3004").origin;
  const username = String(options.username || "").trim();
  const passwordHash = String(options.passwordHash || "").trim();
  const requireAuth = options.requireAuth !== false;
  if (requireAuth && (!username || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/i.test(passwordHash))) {
    throw new Error("Set REPORT_USERNAME and a valid REPORT_PASSWORD_HASH before starting the report service.");
  }
  return {
    staticRoot,
    apiOrigin,
    billingApiOrigin,
    metadataPath: path.resolve(options.metadataPath),
    username,
    passwordHash,
    requireAuth,
    trustProxyHttps: options.trustProxyHttps === true,
    upstreamHeaders: options.upstreamHeaders || {},
    fetchImpl: options.fetchImpl || global.fetch,
  };
}

async function handleAppApi(req, res, url, store) {
  const segments = parsePathSegments(url.pathname, APP_API_PREFIX);

  if (segments.length === 3 && segments[0] === "projects" && segments[2] === "report-links") {
    if (req.method === "GET") return sendJson(res, 200, await store.listReportLinks(segments[1]));
    if (req.method === "POST") {
      const body = await readJsonBody(req);
      return sendJson(res, 201, await store.createReportLink({ ...body, projectName: segments[1] }));
    }
  }
  if (segments.length === 2 && segments[0] === "report-links") {
    if (req.method === "GET") return sendJson(res, 200, await store.getReportLink(segments[1], { enabledOnly: true }));
    if (req.method === "PUT") return sendJson(res, 200, await store.updateReportLink(segments[1], await readJsonBody(req)));
    if (req.method === "DELETE") return sendJson(res, 200, await store.deleteReportLink(segments[1]));
  }

  if (segments.length === 3 && segments[0] === "projects") {
    const [projectName, resource] = [segments[1], segments[2]];
    if (resource === "substations") {
      if (req.method === "GET") return sendJson(res, 200, await store.getProject(projectName));
      if (req.method === "POST") return sendJson(res, 201, await store.createSubstation(projectName, (await readJsonBody(req))?.name));
    }
    if (resource === "device-substations" && req.method === "PUT") {
      const body = await readJsonBody(req);
      return sendJson(res, 200, await store.updateSubstationAssignments(projectName, body?.deviceIds, body?.substationId, body?.side));
    }
    if (resource === "device-labels" && req.method === "PUT") {
      const body = await readJsonBody(req);
      return sendJson(res, 200, await store.updateDeviceLabel(projectName, body?.deviceId, body?.label));
    }
    if (resource === "main-intakes") {
      const body = req.method === "GET" ? {} : await readJsonBody(req);
      if (req.method === "POST") return sendJson(res, 201, await store.createMainIntake(projectName, body?.name));
      if (req.method === "PUT") return sendJson(res, 200, await store.updateMainIntakeAssignments(projectName, body?.deviceIds, body?.mainIntakeId, body?.side));
    }
    if (resource === "device-thresholds" && req.method === "PUT") {
      const body = await readJsonBody(req);
      return sendJson(res, 200, await store.replaceDeviceThresholds(projectName, body?.thresholdsByDevice));
    }
    if (resource === "billing-configuration" && req.method === "PUT") {
      const body = await readJsonBody(req);
      return sendJson(res, 200, await store.replaceBillingConfiguration(projectName, body?.configuration));
    }
    if (resource === "transformer-mappings" && req.method === "PUT") {
      const body = await readJsonBody(req);
      return sendJson(res, 200, await store.replaceTransformerMappings(projectName, body?.mappings));
    }
  }

  if (segments.length === 4 && segments[0] === "projects" && req.method === "DELETE") {
    if (segments[2] === "substations") return sendJson(res, 200, await store.deleteSubstation(segments[1], segments[3]));
    if (segments[2] === "main-intakes") return sendJson(res, 200, await store.deleteMainIntake(segments[1], segments[3]));
  }
  return send(res, 404, "App API route not found.");
}

async function handleLogin(req, res, config, sessions, loginAttempts) {
  if (req.method !== "POST" || !hasMatchingOrigin(req, config)) return send(res, 403, "Forbidden");
  const ip = req.socket.remoteAddress || "unknown";
  const attempt = loginAttempts.get(ip);
  if (attempt?.until > Date.now()) return sendJson(res, 429, { error: "Too many attempts. Try again later." });

  let body;
  try {
    body = await readJsonBody(req);
  } catch (_error) {
    return sendJson(res, 400, { error: "Invalid request." });
  }
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  const valid = username.length <= 256 && password.length <= 1024 && username === config.username && verifyPassword(password, config.passwordHash);
  if (!valid) {
    const failures = (attempt?.failures || 0) + 1;
    loginAttempts.set(ip, { failures, until: failures >= 5 ? Date.now() + 15 * 60 * 1000 : 0 });
    return sendJson(res, 401, { error: "Invalid username or password." });
  }

  loginAttempts.delete(ip);
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { username, lastSeen: Date.now() });
  res.setHeader("Set-Cookie", sessionCookie(req, config, token));
  return sendJson(res, 200, { username });
}

function currentSession(req, sessions) {
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

function verifyPassword(password, encodedHash) {
  const [, salt, expectedHash] = encodedHash.split(":");
  const actualHash = crypto.scryptSync(String(password || ""), Buffer.from(salt, "hex"), 64);
  return crypto.timingSafeEqual(actualHash, Buffer.from(expectedHash, "hex"));
}

function getCookie(req, name) {
  const pair = String(req.headers.cookie || "").split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return pair ? pair.slice(name.length + 1) : "";
}

function sessionCookie(req, config, token = "") {
  const parts = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (!token) parts.push("Max-Age=0");
  if (isSecureRequest(req, config)) parts.push("Secure");
  return parts.join("; ");
}

function hasMatchingOrigin(req, config) {
  const origin = String(req.headers.origin || "");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === req.headers.host && parsed.protocol === (isSecureRequest(req, config) ? "https:" : "http:");
  } catch (_error) {
    return false;
  }
}

function isSecureRequest(req, config) {
  return Boolean(req.socket.encrypted) || (config.trustProxyHttps && req.headers["x-forwarded-proto"] === "https");
}

async function proxyApi(req, res, config) {
  const targetUrl = new URL(req.url, config.apiOrigin);
  return proxyRequest(req, res, config, targetUrl, config.upstreamHeaders);
}

async function proxyBillingApi(req, res, config) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const suffix = requestUrl.pathname.slice("/billing-api".length);
  const targetUrl = new URL(`/api${suffix}${requestUrl.search}`, config.billingApiOrigin);
  return proxyRequest(req, res, config, targetUrl, {});
}

async function proxyRequest(req, res, config, targetUrl, additionalHeaders) {
  const incomingHeaders = { ...req.headers };
  ["host", "origin", "referer", "cookie", "authorization"].forEach((name) => delete incomingHeaders[name]);
  const headers = { ...incomingHeaders, ...additionalHeaders };
  const body = isReadMethod(req.method) ? undefined : req;
  const fetchOptions = { method: req.method, headers, body, redirect: "manual" };
  if (body) fetchOptions.duplex = "half";

  try {
    const upstream = await config.fetchImpl(targetUrl, fetchOptions);
    const responseHeaders = {};
    upstream.headers.forEach((value, key) => {
      if (!["transfer-encoding", "content-encoding", "content-length"].includes(key.toLowerCase())) responseHeaders[key] = value;
    });
    responseHeaders["cache-control"] = "no-store";
    res.writeHead(upstream.status, responseHeaders);
    if (req.method === "HEAD" || !upstream.body) return res.end();
    return Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    return send(res, 502, `Proxy error: ${error.message}`);
  }
}

async function handleDeepHealth(res, config, store) {
  const result = { status: "ok", persistence: "ok", gridvis: "ok" };
  try {
    result.metadata = await store.verify();
  } catch (error) {
    result.status = "degraded";
    result.persistence = error.message;
  }
  try {
    const response = await config.fetchImpl(new URL("/rest/1/projects", config.apiOrigin), {
      method: "GET",
      headers: config.upstreamHeaders,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    result.status = "degraded";
    result.gridvis = error.message;
  }
  return sendJson(res, result.status === "ok" ? 200 : 503, result);
}

function serveStatic(req, res, staticRoot, pathnameOverride = "") {
  let pathname = pathnameOverride || new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname;
  if (pathname === "/") pathname = "/index.html";
  const isModule = pathname.startsWith("/js/") && pathname.endsWith(".mjs");
  const isVendorAsset = pathname.startsWith("/vendor/") && pathname.endsWith(".js");
  if (!ROOT_STATIC_FILES.has(pathname) && !isModule && !isVendorAsset) return send(res, 404, "Not found");
  const filePath = safeJoin(staticRoot, pathname);
  if (!filePath) return send(res, 403, "Forbidden");

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) return send(res, 404, "Not found");
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    if (req.method === "HEAD") return res.end();
    return fs.createReadStream(filePath).pipe(res);
  });
}

function safeJoin(root, requestedPath) {
  const normalized = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const resolved = path.resolve(root, `.${normalized.startsWith(path.sep) ? normalized : `${path.sep}${normalized}`}`);
  const relative = path.relative(path.resolve(root), resolved);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? resolved : null;
}

async function readJsonBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) throw new Error("Request body exceeds 1 MB.");
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_error) {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function parsePathSegments(pathname, prefix) {
  return pathname.slice(prefix.length).split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
}

function parseShortReportSlug(pathname) {
  const match = String(pathname || "").match(/^\/r\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function isPublicLoginAsset(pathname) {
  return new Set(["/login.html", "/login.js", "/login.css"]).has(pathname);
}

function isReadMethod(method) {
  return method === "GET" || method === "HEAD";
}

function send(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

module.exports = { createReportServer };
