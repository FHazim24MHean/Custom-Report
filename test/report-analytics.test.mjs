import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAnalyticsSummary,
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
