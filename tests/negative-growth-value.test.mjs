import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { calculateValue, forwardGrowth, formatValueScore } from "../lib/buy-analysis-engine.ts";

const base = { price: 100, marketCap: 1000, enterpriseValue: 1100, ttmFcf: 50, forwardRevenue: 200, forwardEps: 5, revenueGrowth: .25, epsGrowth: .3 };

test("positive formula is unchanged and negative components are included zero penalties", () => {
  const positive = calculateValue(base);
  const expected = (80 + (3 - 20 / 30) / 2.5 * 100 + (.8 - 5.5 / 25) / .7 * 100 + 100) / 4;
  assert.ok(Math.abs(positive.score - expected) < 1e-10);
  for (const [eps, revenue] of [[-.1, .25], [.3, -.1], [-.1, -.1]]) {
    const value = calculateValue({ ...base, epsGrowth: eps, revenueGrowth: revenue });
    assert.equal(value.eps_growth, eps);
    assert.equal(value.revenue_growth, revenue);
    assert.equal(value.included_weight, 4);
    assert.equal(value.sufficient_data, true);
    assert.ok(value.score <= positive.score);
    for (const [key, growth] of [["peg", eps], ["ev_sales_growth", revenue]]) {
      assert.equal(value.components[key].status, growth < 0 ? "negative_growth" : "valid");
      if (growth < 0) { assert.equal(value[key], null); assert.equal(value.components[key].score, 0); }
    }
    assert.equal(value.score, Object.values(value.components).reduce((sum, item) => sum + item.score, 0) / 4);
  }
});

test("missing, zero denominators, nonfinite inputs and actual zero remain distinct", () => {
  for (const growth of [null, 0, NaN, Infinity]) {
    const value = calculateValue({ ...base, epsGrowth: growth, revenueGrowth: growth });
    assert.equal(value.components.peg.status, "missing");
    assert.equal(value.components.peg.score, null);
    assert.equal(value.included_weight, 2);
    assert.equal(value.score, 90);
  }
  for (const patch of [{ forwardEps: 0 }, { forwardEps: null }, { price: Infinity }]) {
    const value = calculateValue({ ...base, ...patch, epsGrowth: -.1, revenueGrowth: -.1 });
    assert.equal(value.components.peg.status, "missing");
    assert.equal(value.score, null);
  }
  const missingFcf = calculateValue({ ...base, ttmFcf: null, epsGrowth: -.1, revenueGrowth: -.1 });
  assert.equal(missingFcf.components.fcf_yield.status, "missing");
  assert.equal(missingFcf.score, null);
  const missingEv = calculateValue({ ...base, enterpriseValue: null, revenueGrowth: -.1 });
  assert.equal(missingEv.components.ev_sales_growth.status, "missing");
  assert.equal(calculateValue({ ...base, marketCap: 0, epsGrowth: -.1, revenueGrowth: -.1 }).score, null);
  const zero = calculateValue({ ...base, price: 500, ttmFcf: 0, epsGrowth: -.1, revenueGrowth: -.1 });
  assert.equal(zero.score, 0);
  assert.equal(zero.components.fcf_yield.status, "valid");
  assert.equal(formatValueScore(zero.score), "0.0");
  for (const value of [null, undefined, NaN, Infinity]) assert.equal(formatValueScore(value), "N/A");
  assert.equal(forwardGrowth(10, 0), -1);
  assert.equal(forwardGrowth(0, 10), null);
  assert.equal(forwardGrowth(-10, 10), null);
  assert.equal(forwardGrowth(10, null), null);
});

// Load the actual service/page without changing production exports or adding a test framework.
async function loadSource(path, extra = "") {
  const require = createRequire(import.meta.url);
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  source = source.replace(/"(@\/lib\/[^"\n]+|react)"/g, (_, name) => JSON.stringify(name === "react"
    ? pathToFileURL(require.resolve("react")).href : new URL(`../${name.slice(2)}.ts`, import.meta.url).href));
  const { outputText } = ts.transpileModule(source + extra, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
  const code = `import React from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)};\n${outputText}`;
  return import(`data:text/javascript;base64,${Buffer.from(code + `\n//# sourceURL=${path}`).toString("base64")}`);
}

test("actual candidate adapter and gauge display missing as N/A and zero as 0.0", async () => {
  const { analyzedCompany, ScoreGauge } = await loadSource("../app/page.tsx", "\nexport { analyzedCompany, ScoreGauge };\n");
  for (const score of [null, 0, 45]) {
    const company = analyzedCompany({ analyzed_at: "2026-09-26", price: 100, overheat_score: 10, value_score: score, dca_multiplier: null }, {});
    assert.equal(company.value, score);
    const html = renderToStaticMarkup(ScoreGauge({ label: "Value", score: company.value, tone: "neutral" }));
    assert.ok(html.includes(formatValueScore(score)));
    if (score === null) assert.ok(!html.includes("gauge-fill"));
  }
});

test("service persists synthetic five-ticker regression snapshots without inventing missing inputs", async (t) => {
  const { refreshCandidateAnalysis } = await loadSource("../lib/buy-analysis-service.ts");
  const prices = Array.from({ length: 220 }, (_, index) => ({ date: new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10), open: 100, high: 100, low: 100, close: 100 }));
  // Synthetic cases only: these are NOT observed FANG/NVDA/PLTR/MU/ALNY estimates.
  const cases = { FANG: [-.1, -.2], NVDA: [.3, .25], PLTR: [-.1, .25], MU: [.3, -.2], ALNY: [null, null] };
  let currentSymbol;
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => {
    const path = new URL(url).pathname.split("/").at(-1);
    const [eps, revenue] = cases[currentSymbol];
    const statements = Array.from({ length: 4 }, (_, index) => ({ date: `2025-0${index + 1}-01`, reportedCurrency: "USD", totalDebt: 100, cashAndCashEquivalents: 0, freeCashFlow: 12.5 }));
    const rows = path === "full" ? prices
      : path === "analyst-estimates" ? eps === null ? [] : [{ date: "2098-12-31", epsAvg: 5, revenueAvg: 200 }, { date: "2099-12-31", epsAvg: 5 * (1 + eps), revenueAvg: 200 * (1 + revenue) }]
      : path === "market-capitalization" ? [{ marketCap: 1000, date: prices.at(-1).date }] : statements;
    return Response.json(rows);
  };
  for (const symbol of Object.keys(cases)) {
    currentSymbol = symbol;
    let saved;
    const DB = {
      prepare(sql) { return { sql, bind(...values) { this.values = values; return this; }, async first() { return sql.includes("FROM buy_candidates") ? { ticker: symbol } : null; } }; },
      async batch(statements) { saved = statements.find((row) => row.sql.includes("INSERT INTO buy_analysis_snapshots")); },
    };
    const result = await refreshCandidateAnalysis({ DB, FMP_API_KEY: "synthetic-test" }, symbol);
    const metrics = JSON.parse(saved.values[11]);
    const quality = JSON.parse(saved.values[13]);
    assert.deepEqual(quality.value_components, metrics.components);
    assert.equal(saved.values[14], "buy-engine-v1.7-negative-growth-value");
    assert.equal(saved.values[4], result.value_score);
    if (symbol === "ALNY") { assert.equal(result.value_score, null); assert.equal(result.action, "REVIEW"); }
    else assert.equal(Number.isFinite(result.value_score), true);
    if (symbol === "FANG") {
      assert.equal(metrics.components.peg.status, "negative_growth");
      assert.equal(metrics.components.ev_sales_growth.status, "negative_growth");
    }
  }
});
