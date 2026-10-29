import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAnalyticsSummary,
  buildParameterTrend,
  buildScopeKey,
  getAnalyticsScopeOptions,
  getRowStatus,
} from "../js/domain/report-analytics.mjs";

const records = [
  {
    deviceId: "1",
    groupType: "substation",
    groupName: "SS1",
    metricStatuses: { Voltage: "pass", Load: "pass" },
  },
  {
    deviceId: "2",
    groupType: "substation",
    groupName: "SS1",
    metricStatuses: { Voltage: "warning", Load: "pass" },
  },
  {
    deviceId: "3",
    groupType: "main-intake",
    groupName: "MI1",
    metricStatuses: { Voltage: "fail", Load: "pass" },
  },
];

test("summarizes compliance and events across groups", () => {
  const summary = buildAnalyticsSummary(records, [
    { groupType: "substation", groupName: "SS1" },
    { groupType: "main-intake", groupName: "MI1" },
  ]);

  assert.equal(summary.deviceCount, 3);
  assert.equal(summary.compliantCount, 1);
  assert.equal(summary.warningCount, 1);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.complianceRate, 66.7);
  assert.equal(summary.eventCount, 2);
  assert.equal(summary.groups.length, 2);
  assert.equal(summary.metrics.find((metric) => metric.metric === "Voltage").fail, 1);
});

test("filters analytics by configured electrical group", () => {
  const scopeKey = buildScopeKey("substation", "SS1");
  const summary = buildAnalyticsSummary(records, [], { scopeKey });

  assert.equal(summary.deviceCount, 2);
  assert.equal(summary.failedCount, 0);
  assert.equal(summary.complianceRate, 100);
});

test("lists stable group filter options", () => {
  const options = getAnalyticsScopeOptions(records);
  assert.deepEqual(
    options.map((option) => option.label),
    ["Main Intake: MI1", "Substation: SS1"]
  );
});

test("a failed metric takes precedence over warning and pass", () => {
  assert.equal(getRowStatus({ metricStatuses: { A: "warning", B: "fail" } }), "fail");
  assert.equal(getRowStatus({ metricStatuses: {} }), "unavailable");
});

test("builds annual statistics and compares the latest two months", () => {
  const trend = buildParameterTrend([
    { capturedAt: "2026-01-05 00:00:00", value: 10 },
    { capturedAt: "2026-01-15 00:00:00", value: 20 },
    { capturedAt: "2026-09-01 00:00:00", value: 30 },
    { capturedAt: "2026-09-02 00:00:00", value: 40 },
    { capturedAt: "2026-10-01 00:00:00", value: 50 },
    { capturedAt: "2026-10-02 00:00:00", value: 60 },
  ]);

  assert.equal(trend.annual.year, 2026);
  assert.deepEqual(trend.annual.points[2], {
    year: 2026,
    month: 0,
    label: "Jan 26",
    average: 15,
    min: 10,
    max: 20,
    count: 2,
  });
  assert.equal(trend.annual.label, "November 2025 - October 2026");
  assert.equal(trend.monthlyComparison.current.label, "October 2026");
  assert.equal(trend.monthlyComparison.previous.label, "September 2026");
  assert.equal(trend.monthlyComparison.current.points[1].average, 60);
  assert.equal(trend.monthlyComparison.previous.points[1].average, 40);
});

test("returns empty trend points when parameter data is unavailable", () => {
  const trend = buildParameterTrend([{ capturedAt: "bad", value: "N/A" }]);
  assert.equal(trend.sampleCount, 0);
  assert.equal(trend.annual.points.length, 12);
  assert.equal(trend.monthlyComparison.current, null);
});
