const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { MetadataStore } = require("../lib/metadata-store");

test("persists project groups, thresholds, transformer mappings, and billing configuration", async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "custom-report-store-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const store = new MetadataStore(path.join(directory, "metadata.json"));

  const withSubstation = await store.createSubstation("Project A", "SS12");
  const substationId = withSubstation.substations[0].id;
  await store.updateSubstationAssignments("Project A", ["101"], substationId, "HT");
  await store.replaceDeviceThresholds("Project A", {
    101: { POWER_FACTOR: { min: 0.9, max: 1 } },
  });
  await store.replaceTransformerMappings("Project A", [
    { htDeviceId: "101", lvDeviceId: "102", label: "TX1" },
  ]);
  await store.replaceBillingConfiguration("Project A", {
    tariffName: "C1 ToU",
    currency: "MYR",
    useTou: true,
    flatEnergyRate: 0.345,
    peakEnergyRate: 0.42,
    offPeakEnergyRate: 0.28,
    demandRate: 43.6,
    afaRateSen: -0.47,
    peakStartTime: "08:00",
    peakEndTime: "22:00",
    peakDays: [1, 2, 3, 4, 5],
  });

  const project = await store.getProject("Project A");
  assert.equal(project.deviceAssignments[0].side, "HT");
  assert.deepEqual(project.thresholdOverridesByDevice[101].POWER_FACTOR, { min: 0.9, max: 1 });
  assert.equal(project.transformerMappings[0].label, "TX1");
  assert.deepEqual(project.billingConfiguration, {
    tariffName: "C1 ToU",
    currency: "MYR",
    useTou: true,
    flatEnergyRate: 0.345,
    peakEnergyRate: 0.42,
    offPeakEnergyRate: 0.28,
    exportRate: 0,
    demandRate: 43.6,
    fixedCharge: 0,
    minimumCharge: 0,
    taxPercent: 0,
    afaRateSen: -0.47,
    peakStartTime: "08:00",
    peakEndTime: "22:00",
    peakDays: [1, 2, 3, 4, 5],
  });
});

test("recovers the previous valid metadata file when the primary JSON is corrupt", async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "custom-report-recovery-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "metadata.json");
  const store = new MetadataStore(filePath);

  await store.createSubstation("Project A", "SS1");
  await store.createSubstation("Project A", "SS2");
  await fs.promises.writeFile(filePath, "{invalid", "utf8");

  const recovered = await store.getProject("Project A");
  assert.deepEqual(recovered.substations.map((item) => item.name), ["SS1"]);
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(filePath, "utf8")));
});

test("recovers the backup when an interrupted replacement leaves no primary file", async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "custom-report-missing-primary-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "metadata.json");
  const store = new MetadataStore(filePath);

  await store.createSubstation("Project A", "SS1");
  await store.createSubstation("Project A", "SS2");
  await fs.promises.rm(filePath);

  const recovered = await store.getProject("Project A");
  assert.deepEqual(recovered.substations.map((item) => item.name), ["SS1"]);
  assert.equal(fs.existsSync(filePath), true);
});
