import test from "node:test";
import assert from "node:assert/strict";

import {
  appendGridVisEventTypes,
  DEFAULT_GRIDVIS_EVENT_TYPES,
} from "../js/domain/gridvis-event-types.mjs";

test("appends GridVis event types as repeated singular query parameters", () => {
  const params = new URLSearchParams({
    start: "NAMED_Today",
    end: "NAMED_Today",
  });

  appendGridVisEventTypes(params, ["VoltageUnder", "VoltageOutage"]);

  assert.equal(
    params.toString(),
    "start=NAMED_Today&end=NAMED_Today&type=VoltageUnder&type=VoltageOutage"
  );
  assert.deepEqual(params.getAll("type"), ["VoltageUnder", "VoltageOutage"]);
  assert.equal(params.has("types"), false);
});

test("includes the documented GridVis power-quality event types", () => {
  assert.ok(DEFAULT_GRIDVIS_EVENT_TYPES.includes("VoltageOver"));
  assert.ok(DEFAULT_GRIDVIS_EVENT_TYPES.includes("VoltageUnder"));
  assert.ok(DEFAULT_GRIDVIS_EVENT_TYPES.includes("VoltageOutage"));
  assert.ok(DEFAULT_GRIDVIS_EVENT_TYPES.includes("VoltageFastChange"));
  assert.ok(DEFAULT_GRIDVIS_EVENT_TYPES.includes("CurrentOver"));
});
