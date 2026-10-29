import test from "node:test";
import assert from "node:assert/strict";

import { buildBillingAnalytics, normalizeTariff } from "../js/domain/billing-analytics.mjs";

test("calculates interval consumption, demand, export credit, tax, and totals", () => {
  const result = buildBillingAnalytics(
    [
      {
        deviceId: "1",
        deviceName: "Meter 1",
        groupType: "substation",
        groupName: "SS1",
        readings: [
          {
            capturedAt: "2026-10-01T00:00:00Z",
            importMinWh: 1_000_000,
            importMaxWh: 1_120_000,
            exportMinWh: 50_000,
            exportMaxWh: 60_000,
            activePowerMaxW: 45_000,
            powerFactor: 0.94,
          },
          {
            capturedAt: "2026-10-02T00:00:00Z",
            importMinWh: 1_120_000,
            importMaxWh: 1_300_000,
            exportMinWh: 60_000,
            exportMaxWh: 65_000,
            activePowerMaxW: 52_000,
            powerFactor: 0.96,
          },
        ],
      },
    ],
    {
      energyRate: 0.5,
      exportRate: 0.2,
      demandRate: 10,
      fixedCharge: 20,
      taxPercent: 8,
      afaRate: -0.0047,
    }
  );

  const row = result.rows[0];
  assert.equal(row.importedKwh, 300);
  assert.equal(row.exportedKwh, 15);
  assert.equal(row.maxDemandKw, 52);
  assert.equal(row.averagePowerFactor, 0.95);
  assert.equal(row.energyCharge, 150);
  assert.equal(row.exportCredit, 3);
  assert.equal(row.demandCharge, 520);
  assert.equal(row.afaCharge, -1.41);
  assert.equal(row.taxAmount, 54.85);
  assert.equal(row.totalCharge, 740.44);
  assert.equal(result.totalCharge, 740.44);
});

test("marks meters without imported energy as unavailable", () => {
  const result = buildBillingAnalytics([
    {
      deviceId: "2",
      readings: [{ capturedAt: "2026-10-01T00:00:00Z", activePowerMaxW: 1000 }],
    },
  ]);

  assert.equal(result.availableMeterCount, 0);
  assert.equal(result.unavailableMeterCount, 1);
  assert.equal(result.rows[0].available, false);
  assert.equal(result.totalCharge, 0);
});

test("normalizes invalid tariff inputs to safe non-negative values", () => {
  assert.deepEqual(normalizeTariff({ energyRate: "0.4", demandRate: -5, taxPercent: "bad" }), {
    currency: "MYR",
    energyRate: 0.4,
    exportRate: 0,
    demandRate: 0,
    fixedCharge: 0,
    taxPercent: 0,
    afaRate: 0,
    sourceLabel: "Temporary tariff",
  });
});

test("accepts a signed AFA rate while keeping other charges non-negative", () => {
  const tariff = normalizeTariff({ afaRate: "-0.0047", fixedCharge: -20 });
  assert.equal(tariff.afaRate, -0.0047);
  assert.equal(tariff.fixedCharge, 0);
});
