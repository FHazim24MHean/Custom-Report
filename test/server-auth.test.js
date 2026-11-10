const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createReportServer } = require("../lib/server-app");

function passwordHash(password) {
  const salt = Buffer.alloc(16, 1);
  return `scrypt:${salt.toString("hex")}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

test("redirects unauthenticated report links to login while APIs return 401", async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "custom-report-auth-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));

  const server = createReportServer({
    apiOrigin: "http://127.0.0.1:9",
    staticRoot: path.resolve(__dirname, ".."),
    metadataPath: path.join(directory, "metadata.json"),
    requireAuth: true,
    username: "reportadmin",
    passwordHash: passwordHash("test-password-123"),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  }));

  const origin = `http://127.0.0.1:${server.address().port}`;
  const shortLink = await fetch(`${origin}/r/ss12-ht?autorun=1`, {
    headers: { Accept: "text/html" },
    redirect: "manual",
  });
  assert.equal(shortLink.status, 302);
  assert.equal(shortLink.headers.get("location"), "/login.html?next=%2Fr%2Fss12-ht%3Fautorun%3D1");

  const queryLink = await fetch(`${origin}/?project=Project%20A&group=SS12&side=HT`, {
    headers: { Accept: "text/html" },
    redirect: "manual",
  });
  assert.equal(queryLink.status, 302);
  assert.equal(
    queryLink.headers.get("location"),
    "/login.html?next=%2F%3Fproject%3DProject%2520A%26group%3DSS12%26side%3DHT",
  );

  const loginPage = await fetch(`${origin}${shortLink.headers.get("location")}`);
  assert.equal(loginPage.status, 200);

  const apiResponse = await fetch(`${origin}/app-api/projects/Project%20A/substations`, {
    headers: { Accept: "application/json" },
    redirect: "manual",
  });
  assert.equal(apiResponse.status, 401);
  assert.equal(apiResponse.headers.get("location"), null);
  assert.deepEqual(await apiResponse.json(), { error: "Sign in to access reports." });
});
