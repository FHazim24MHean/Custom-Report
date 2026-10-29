const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createReportServer } = require("../lib/server-app");

test("serves health, browser modules, and project configuration", async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "custom-report-server-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const server = createReportServer({
    apiOrigin: "http://127.0.0.1:9",
    staticRoot: path.resolve(__dirname, ".."),
    metadataPath: path.join(directory, "metadata.json"),
    requireAuth: false,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  }));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${origin}/health`).then((response) => response.json());
  assert.deepEqual(health, { status: "ok", persistence: "json" });

  const moduleResponse = await fetch(`${origin}/js/domain/report-math.mjs`);
  assert.equal(moduleResponse.status, 200);
  assert.match(moduleResponse.headers.get("content-type"), /javascript/);
  assert.equal((await fetch(`${origin}/js/domain/report-analytics.mjs`)).status, 200);
  assert.equal((await fetch(`${origin}/js/domain/billing-analytics.mjs`)).status, 200);

  assert.equal((await fetch(`${origin}/app.mjs`)).status, 200);
  assert.equal((await fetch(`${origin}/vendor/exceljs.min.js`)).status, 200);

  const project = await fetch(`${origin}/app-api/projects/Project%20A/substations`).then((response) => response.json());
  assert.deepEqual(project.thresholdOverridesByDevice, {});
  assert.deepEqual(project.transformerMappings, []);

  const thresholdResponse = await fetch(`${origin}/app-api/projects/Project%20A/device-thresholds`, {
    method: "PUT",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      thresholdsByDevice: { 101: { POWER_FACTOR: { min: 0.9, max: 1 } } },
    }),
  });
  assert.equal(thresholdResponse.status, 200);
  const savedProject = await thresholdResponse.json();
  assert.equal(savedProject.thresholdOverridesByDevice[101].POWER_FACTOR.min, 0.9);
});
