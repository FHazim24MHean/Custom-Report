import test from "node:test";
import assert from "node:assert/strict";

import {
  filterReportDevicesByGroupType,
  getReportDeviceGroupType,
  normalizeReportDeviceGroupFilter,
} from "../js/domain/report-device-filter.mjs";

const devices = [
  { devid: "1", name: "Unassigned" },
  { devid: "2", name: "Substation" },
  { devid: "3", name: "Main Intake" },
  { devid: "4", name: "Main Intake precedence" },
];
const substations = {
  2: { substationId: "ss1" },
  4: { substationId: "ss2" },
};
const mainIntakes = {
  3: { mainIntakeId: "mi1" },
  4: { mainIntakeId: "mi2" },
};

test("classifies report devices with Main Intake taking precedence", () => {
  assert.equal(getReportDeviceGroupType("1", substations, mainIntakes), "unassigned");
  assert.equal(getReportDeviceGroupType("2", substations, mainIntakes), "substation");
  assert.equal(getReportDeviceGroupType("3", substations, mainIntakes), "main-intake");
  assert.equal(getReportDeviceGroupType("4", substations, mainIntakes), "main-intake");
});

test("filters the report device list by assignment category", () => {
  assert.deepEqual(
    filterReportDevicesByGroupType(devices, "substation", substations, mainIntakes)
      .map((device) => device.devid),
    ["2"]
  );
  assert.deepEqual(
    filterReportDevicesByGroupType(devices, "main-intake", substations, mainIntakes)
      .map((device) => device.devid),
    ["3", "4"]
  );
  assert.deepEqual(
    filterReportDevicesByGroupType(devices, "unassigned", substations, mainIntakes)
      .map((device) => device.devid),
    ["1"]
  );
});

test("falls back to all devices for unknown filter values", () => {
  assert.equal(normalizeReportDeviceGroupFilter("invalid"), "all");
  assert.equal(filterReportDevicesByGroupType(devices, "invalid").length, devices.length);
});
