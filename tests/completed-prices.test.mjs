import assert from "node:assert/strict";
import test from "node:test";
import { completedUsDailyRows, isCompletedPriceCacheSafe } from "../lib/completed-prices.ts";

const rows = [
  { date: "2026-08-17", open: 1, high: 1, low: 1, close: 1 },
  { date: "2026-08-18", open: 2, high: 2, low: 2, close: 2 },
];

test("excludes the current US daily bar before the close confirmation buffer", () => {
  assert.deepEqual(completedUsDailyRows(rows, new Date("2026-08-18T19:59:00Z")).map((row) => row.date), ["2026-08-17"]);
});

test("includes the current US daily bar after 16:15 New York time", () => {
  assert.deepEqual(completedUsDailyRows(rows, new Date("2026-08-18T20:15:00Z")).map((row) => row.date), ["2026-08-17", "2026-08-18"]);
});

test("rejects a benchmark cache captured before the current session closed", () => {
  const afterClose = new Date("2026-08-18T20:20:00Z");
  assert.equal(isCompletedPriceCacheSafe(rows, "2026-08-18T19:30:00Z", afterClose), false);
  assert.equal(isCompletedPriceCacheSafe(rows, "2026-08-18T20:16:00Z", afterClose), true);
});

