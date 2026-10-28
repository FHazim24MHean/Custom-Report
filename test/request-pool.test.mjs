import test from "node:test";
import assert from "node:assert/strict";

import { runTaskPool } from "../js/api/request-pool.mjs";

test("limits concurrent GridVis requests and preserves task order", async () => {
  let active = 0;
  let peak = 0;
  const tasks = Array.from({ length: 12 }, (_, index) => async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return index;
  });

  const results = await runTaskPool(tasks, { concurrency: 3 });
  assert.equal(peak, 3);
  assert.deepEqual(results.map((result) => result.value), [...Array(12).keys()]);
});

test("captures individual failures without stopping the report", async () => {
  const results = await runTaskPool([
    async () => "ok",
    async () => { throw new Error("failed"); },
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
});
