import test from "node:test";
import assert from "node:assert/strict";

import {
  filterColumnGroups,
  getColumnsWithData,
  hasTableCellData,
} from "../js/domain/table-columns.mjs";

test("recognizes unavailable markers without discarding valid zero values", () => {
  assert.equal(hasTableCellData(null), false);
  assert.equal(hasTableCellData(" N/A "), false);
  assert.equal(hasTableCellData("-"), false);
  assert.equal(hasTableCellData(0), true);
  assert.equal(hasTableCellData("0.00"), true);
  assert.equal(hasTableCellData("OK"), true);
});

test("removes columns that contain no report data", () => {
  const columns = ["Device", "Voltage", "Temperature", "Pressure"];
  const rows = [
    { Device: "TX1", Voltage: "415V", Temperature: "N/A", Pressure: "" },
    { Device: "TX2", Voltage: 0, Temperature: "-", Pressure: null },
  ];

  assert.deepEqual(getColumnsWithData(columns, rows), ["Device", "Voltage"]);
});

test("remaps grouped headers after empty columns are removed", () => {
  const originalColumns = ["Device", "V Avg", "V Min", "V Max"];
  const visibleColumns = ["Device", "V Avg", "V Max"];
  const groups = [{
    id: "Voltage",
    start: 1,
    end: 3,
    columns: ["V Avg", "V Min", "V Max"],
    subHeaders: ["Avg", "Min", "Max"],
  }];

  assert.deepEqual(filterColumnGroups(groups, originalColumns, visibleColumns), [{
    id: "Voltage",
    start: 1,
    end: 2,
    columns: ["V Avg", "V Max"],
    subHeaders: ["Avg", "Max"],
  }]);
});
