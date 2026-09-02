import assert from "node:assert/strict";
import test from "node:test";
import { parseCandidateSnapshot } from "../lib/candidate-contract.ts";

const valid = {
  ticker: "NVDA", company_name: "NVIDIA Corporation", fundamental_stage: "watch",
  fundamental_score: 82.2,
  metrics: { revenue_yoy_pct: 50 }, source_snapshot_date: "2026-08-12",
};

test("accepts a complete Fundamental candidate snapshot", () => {
  const parsed = parseCandidateSnapshot(valid);
  assert.equal(parsed.ticker, "NVDA");
  assert.equal(parsed.fundamental_score, 82.2);
  assert.deepEqual(Object.keys(parsed).sort(), ["company_name", "fundamental_score", "fundamental_stage", "metrics", "source_snapshot_date", "ticker"].sort());
});

test("does not accept PASS as a Fundamental stage", () => {
  assert.throws(() => parseCandidateSnapshot({ ...valid, fundamental_stage: "PASS" }));
});

