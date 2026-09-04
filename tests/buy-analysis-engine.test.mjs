import assert from "node:assert/strict";
import test from "node:test";
import { calculateOverheat, calculateRsi, calculateValue, decideDca, deriveFundamentalTrend } from "../lib/buy-analysis-engine.ts";

test("calculates RSI14 with Wilder recursive smoothing", () => {
  const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64];
  assert.ok(Math.abs(calculateRsi(closes, 14) - 57.91502067008556) < 1e-10);
});

test("keeps the base DCA matrix and applies the V1.4 Fundamental Trend adjustment", () => {
  assert.deepEqual(decideDca(85, 10), {
    fundamental_context: "TREND_ADJUSTMENT", value_state: "VERY_UNDERVALUED", overheat_state: "LOW", base_multiplier: 1.5,
    fundamental_trend: { state: "STABLE", adjustment: 0, reason: "No fundamental trend input" },
    multiplier: 1.5, action: "BUY", reason: "VERY_UNDERVALUED value, LOW overheat; Fundamental trend STABLE (+0.0x)",
  });
  const slowing = deriveFundamentalTrend({ stage: "watch", currentScore: 80, previousScore: 85 });
  assert.equal(decideDca(85, 10, slowing).multiplier, 1);
  assert.equal(decideDca(10, 90).action, "PAUSE");
  assert.equal(decideDca(null, 10).action, "REVIEW");
});

test("requires sufficient Value coverage", () => {
  const complete = calculateValue({ price: 100, marketCap: 1000, enterpriseValue: 1100, ttmFcf: 50, forwardRevenue: 200, forwardEps: 5, revenueGrowth: .25, epsGrowth: .3 });
  assert.equal(complete.sufficient_data, true);
  assert.equal(typeof complete.score, "number");
  const incomplete = calculateValue({ price: 100, marketCap: 1000, enterpriseValue: 0, ttmFcf: 0, forwardRevenue: null, forwardEps: null, revenueGrowth: null, epsGrowth: null });
  assert.equal(incomplete.score, null);
});

test("calculates finite Overheat components from aligned histories", () => {
  const stock = Array.from({ length: 220 }, (_, index) => 100 + index * .2);
  const benchmark = Array.from({ length: 220 }, (_, index) => 100 + index * .1);
  const result = calculateOverheat(stock, benchmark);
  assert.equal(Number.isFinite(result.score), true);
  assert.equal(Number.isFinite(result.price_acceleration), true);
  assert.equal(Number.isFinite(result.ma_dispersion), true);
  assert.ok(Math.abs(result.ma_extension_score - (result.ma20_score * .4 + result.ma50_score * .4 + result.ma200_score * .2)) < 1e-10);
  assert.ok(Math.abs(result.score - (result.ma_extension_score * .4 + result.rsi_score * .2 + result.return_3m_score * .2 + result.excess_return_3m_score * .2)) < 1e-10);
});

test("uses stock-only history for technical metrics and aligned history only for QQQ excess return", () => {
  const stock = Array.from({ length: 220 }, (_, index) => 100 + index * .2);
  const alignedStock = stock.slice(-100);
  const benchmark = Array.from({ length: 100 }, (_, index) => 100 + index * .1);
  const result = calculateOverheat(stock, benchmark, alignedStock);
  assert.equal(result.price, stock.at(-1));
  assert.ok(Math.abs(result.excess_return_3m - ((alignedStock.at(-1) / alignedStock.at(-64) - 1) - (benchmark.at(-1) / benchmark.at(-64) - 1))) < 1e-10);
});

