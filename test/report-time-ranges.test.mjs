import test from "node:test";
import assert from "node:assert/strict";

import { buildCalendarTimeWindowQuery } from "../js/domain/report-time-ranges.mjs";

function tokenFor(isoDate) {
  return `UTCSEC_${Math.floor(new Date(isoDate).getTime() / 1000)}`;
}

test("builds full current and previous calendar month ranges", () => {
  const now = new Date("2026-11-18T09:30:45Z");

  assert.deepEqual(buildCalendarTimeWindowQuery("thismonth", now), {
    start: tokenFor("2026-11-01T00:00:00Z"),
    end: tokenFor("2026-11-30T23:59:59Z"),
  });
  assert.deepEqual(buildCalendarTimeWindowQuery("lastmonth", now), {
    start: tokenFor("2026-10-01T00:00:00Z"),
    end: tokenFor("2026-10-31T23:59:59Z"),
  });
});

test("handles year and leap-year boundaries for calendar months", () => {
  assert.deepEqual(
    buildCalendarTimeWindowQuery("lastmonth", new Date("2024-03-15T12:00:00Z")),
    {
      start: tokenFor("2024-02-01T00:00:00Z"),
      end: tokenFor("2024-02-29T23:59:59Z"),
    }
  );
});

test("builds a rolling six-month range and clamps short months", () => {
  const now = new Date("2024-08-31T09:30:45Z");
  assert.deepEqual(buildCalendarTimeWindowQuery("last6", now), {
    start: tokenFor("2024-02-29T09:30:45Z"),
    end: tokenFor("2024-08-31T09:30:45Z"),
  });
});

test("returns null for ranges handled elsewhere", () => {
  assert.equal(buildCalendarTimeWindowQuery("today"), null);
});
