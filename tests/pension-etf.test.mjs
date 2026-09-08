import assert from "node:assert/strict";
import test from "node:test";
import { calculateHistoricalValuation, classifyEtf } from "../lib/pension-etf.ts";

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
