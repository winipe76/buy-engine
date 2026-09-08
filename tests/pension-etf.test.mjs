import assert from "node:assert/strict";
import test from "node:test";
import { calculateHistoricalValuation, classifyEtf, searchKrxEtfs } from "../lib/pension-etf.ts";

test("classifies pension ETF valuation profiles without mixing stock candidates", () => {
  assert.equal(classifyEtf("ACE KRX금현물").profile, "GOLD");
  assert.equal(classifyEtf("TIGER 미국나스닥100").profile, "NASDAQ");
  assert.equal(classifyEtf("KODEX 금융고배당TOP10").profile, "DIVIDEND");
});

test("calculates price-history valuation and dividend yield", () => {
  const metrics = calculateHistoricalValuation("DIVIDEND", Array.from({ length: 252 }, (_, index) => 100 + index), 10);
  assert.equal(metrics[0].label, "최근 12개월 분배금 수익률");
  assert.ok(Math.abs(metrics[0].value - 10 / 351 * 100) < 1e-10);
  assert.equal(metrics.at(-1).value, 0);
});

test("finds an ETF by code even though the KRX finder only searches names", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    assert.equal(new URLSearchParams(init.body).get("searchText"), "");
    return Response.json({ block1: [
      { full_code: "KR7396500001", short_code: "396500", codeName: "TIGER 반도체TOP10", dellistDd: "" },
      { full_code: "KR7411060007", short_code: "411060", codeName: "ACE KRX금현물", dellistDd: "" },
    ] });
  };
  try { assert.deepEqual((await searchKrxEtfs("396500")).map((item) => item.ticker), ["396500"]); }
  finally { globalThis.fetch = originalFetch; }
});
