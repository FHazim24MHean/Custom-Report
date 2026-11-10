import test from "node:test";
import assert from "node:assert/strict";

import { buildUserDefinedReportRequestSpecs } from "../js/domain/value-description-aliases.mjs";

test("maps Virtual Device user-defined temperature and pressure descriptions", () => {
  const descriptions = [
    {
      id: "1",
      timebase: "900",
      online: false,
      value: "UserDefined",
      typeName: "TEMP",
      type: "Overall",
      unit: "degC",
      valueName: "TEMP",
    },
    {
      id: "0",
      timebase: "900",
      online: false,
      value: "UserDefined",
      typeName: "PRESSURE",
      type: "L1",
      unit: "BAR",
      valueName: "PRESSURE",
    },
  ];

  assert.deepEqual(buildUserDefinedReportRequestSpecs(descriptions), [
    { metricName: "TX_TEMPERATURE", queryValue: "UserDefined", phase: "Overall" },
    { metricName: "TX_PRESSURE", queryValue: "UserDefined", phase: "L1" },
  ]);
});

test("does not request aliases that a device does not expose", () => {
  assert.deepEqual(buildUserDefinedReportRequestSpecs([
    { value: "UserDefined", typeName: "FLOW", type: "L2", valueName: "FLOW" },
  ]), []);
});
