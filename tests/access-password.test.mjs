import assert from "node:assert/strict";
import test from "node:test";
import { authorizedByPassword } from "../lib/access-password.ts";

const request = (value) => new Request("https://buy-engine.example", { headers: value ? { Authorization: value } : {} });

test("accepts only the configured Buy Engine password", () => {
  assert.equal(authorizedByPassword(request(`Basic ${btoa("buy:1219")}`), "1219"), true);
  assert.equal(authorizedByPassword(request(`Basic ${btoa("buy:wrong")}`), "1219"), false);
  assert.equal(authorizedByPassword(request(), "1219"), false);
});

