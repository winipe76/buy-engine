import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const route = fs.readFileSync("app/api/candidates/sync/route.ts", "utf8");
const worker = fs.readFileSync("worker/index.ts", "utf8");
const refresh = fs.readFileSync("app/api/analysis/refresh/route.ts", "utf8");
const candidates = fs.readFileSync("app/api/candidates/route.ts", "utf8");

test("authenticated sync route supports candidate removal", () => {
  assert.match(route, /export async function DELETE/);
  assert.match(route, /setCandidateActive\(runtime\.DB, ticker, false\)/);
  assert.match(route, /bearerToken\(request\)/);
});

test("authenticated sync route reports the persisted active state", () => {
  assert.match(route, /export async function GET/);
  assert.match(route, /SELECT ticker,active FROM buy_candidates WHERE ticker=\?/);
  assert.match(route, /added: candidate\?\.active === 1/);
});

test("password access authorizes mobile updates while sync keeps its token", () => {
  assert.match(worker, /url\.pathname === "\/api\/candidates\/sync"/);
  assert.doesNotMatch(refresh, /oai-authenticated-user-id/);
  assert.doesNotMatch(candidates, /oai-authenticated-user-id/);
});

