import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDerivedNominalMetrics,
  calculateAverageFromMetricKeys,
  calculatePercentUnbalanceFromMetricKeys,
  deriveRatioMetric,
  isValueWithinToleranceWarningBand,
  normalizeMetricKey,
  parseNumericValue,
} from "../js/domain/report-math.mjs";

test("parses GridVis numeric strings and normalizes metric names", () => {
  assert.equal(parseNumericValue("415.25 V"), 415.25);
  assert.equal(parseNumericValue("-1.5%"), -1.5);
  assert.ok(Number.isNaN(parseNumericValue("N/A")));
  assert.equal(normalizeMetricKey("Voltage, V2"), "V2");
  assert.equal(normalizeMetricKey("Current3"), "A3");
});

test("calculates the displayed three-phase average", () => {
  const average = calculateAverageFromMetricKeys(
    { V1: 410, V2: 415, V3: 420 },
    ["V1", "V2", "V3"]
  );
  assert.equal(average, 415);
});

test("calculates phase unbalance as maximum deviation from phase average", () => {
  const unbalance = calculatePercentUnbalanceFromMetricKeys(
    { V1: 400, V2: 410, V3: 420 },
    ["V1", "V2", "V3"]
  );
  assert.equal(Number(unbalance.toFixed(4)), 2.439);
});

test("uses conservative bounds when deriving power factor", () => {
  const result = deriveRatioMetric(
    {
      POWER_ACTIVE_SUM: 900,
      POWER_ACTIVE_SUM_Min: 800,
      POWER_ACTIVE_SUM_Max: 950,
      POWER_APPARENT_SUM: 1000,
      POWER_APPARENT_SUM_Min: 980,
      POWER_APPARENT_SUM_Max: 1050,
    },
    "POWER_ACTIVE_SUM",
    "POWER_APPARENT_SUM",
    { clampMin: 0, clampMax: 1.2 }
  );
  assert.deepEqual(result, { value: "0.90", min: "0.76", max: "0.97" });
});

test("builds averages, unbalance, and fallback power factor without replacing source data", () => {
  const derived = buildDerivedNominalMetrics({
    V1: 410,
    V2: 415,
    V3: 420,
    V_AVG: 999,
    A1: 90,
    A2: 100,
    A3: 110,
    POWER_ACTIVE_SUM: 900,
    POWER_APPARENT_SUM: 1000,
  });
  assert.equal(derived.V_AVG, undefined);
  assert.equal(derived.A_AVG, "100.00");
  assert.equal(derived.POWER_FACTOR, "0.90");
});

test("marks the outer 20 percent of a valid range as warning", () => {
  const tolerance = { min: 0, max: 100 };
  assert.equal(isValueWithinToleranceWarningBand(20, tolerance), true);
  assert.equal(isValueWithinToleranceWarningBand(50, tolerance), false);
  assert.equal(isValueWithinToleranceWarningBand(80, tolerance), true);
});
