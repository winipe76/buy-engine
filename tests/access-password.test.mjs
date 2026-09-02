import assert from "node:assert/strict";
import test from "node:test";
import { accessToken, authorizedByCookie } from "../lib/access-password.ts";

const request = (value) => new Request("https://buy-engine.example", { headers: value ? { Cookie: value } : {} });

test("accepts only a cookie derived from the configured password", async () => {
  const token = await accessToken("1219");
  assert.equal(await authorizedByCookie(request(`buy_engine_access=${token}`), "1219"), true);
  assert.equal(await authorizedByCookie(request("buy_engine_access=wrong"), "1219"), false);
  assert.equal(await authorizedByCookie(request(), "1219"), false);
});

