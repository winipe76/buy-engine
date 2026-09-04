import { calculateOverheat, calculateValue, decideDca, deriveFundamentalTrend, numeric, type NumericRow } from "@/lib/buy-analysis-engine";
import { completedUsDailyRows, isCompletedPriceCacheSafe } from "@/lib/completed-prices";

const FMP_BASE_URL = "https://financialmodelingprep.com/stable";
const SOURCE_VERSION = "buy-engine-v1.4-fundamental-trend";
const BENCHMARK_CACHE_MS = 12 * 60 * 60 * 1000;

type AnalysisRuntime = { DB: D1Database; FMP_API_KEY: string };

async function fmpGet(apiKey: string, path: string, params: Record<string, string | number>) {
  const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])), apikey: apiKey });
  const response = await fetch(`${FMP_BASE_URL}/${path}?${query}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  const payload = await response.json() as unknown;
  if (!response.ok) throw new Error(`FMP ${path} request failed (${response.status})`);
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "Error Message" in payload) throw new Error(String((payload as Record<string, unknown>)["Error Message"]));
  if (!Array.isArray(payload)) throw new Error(`FMP ${path} returned an unexpected response`);
  return payload as NumericRow[];
}

function validatePrices(symbol: string, rows: NumericRow[]) {
  if (!rows.length) throw new Error(`${symbol}: no price rows returned`);
  const dates = rows.map((row) => String(row.date ?? ""));
  if (dates.some((date) => !date)) throw new Error(`${symbol}: price date is missing`);
  if (new Set(dates).size !== dates.length) throw new Error(`${symbol}: duplicate price dates returned`);
  for (const row of rows) {
    const values = [numeric(row, "open"), numeric(row, "high"), numeric(row, "low"), numeric(row, "close")];
    if (values.some((value) => value === null || value <= 0)) throw new Error(`${symbol}: invalid OHLC value on ${row.date}`);
    const [open, high, low, close] = values as number[];
    if (low > Math.min(open, close) || high < Math.max(open, close) || low > high) throw new Error(`${symbol}: inconsistent OHLC range on ${row.date}`);
  }
}

function priceSeries(rows: NumericRow[]) {
  const sorted = [...rows].sort((left, right) => String(left.date).localeCompare(String(right.date)));
  return { dates: sorted.map((row) => String(row.date)), closes: sorted.map((row) => numeric(row, "close")!) };
}

function alignPrices(stockRows: NumericRow[], benchmarkRows: NumericRow[]) {
  const stock = new Map(stockRows.map((row) => [String(row.date), numeric(row, "close")!]).filter(([, value]) => value !== null));
  const benchmark = new Map(benchmarkRows.map((row) => [String(row.date), numeric(row, "close")!]).filter(([, value]) => value !== null));
  const dates = [...stock.keys()].filter((date) => benchmark.has(date)).sort();
  return { dates, closes: dates.map((date) => stock.get(date)!), benchmarkCloses: dates.map((date) => benchmark.get(date)!) };
}

function ttmSum(rows: NumericRow[], ...keys: string[]) {
  if (rows.length < 4) return null;
  const values = rows.slice(0, 4).map((row) => numeric(row, ...keys));
  return values.every((value) => value !== null) ? (values as number[]).reduce((sum, value) => sum + value, 0) : null;
}

function futureEstimates(rows: NumericRow[], today: string) {
  const future = rows.filter((row) => String(row.date ?? "") >= today).sort((left, right) => String(left.date).localeCompare(String(right.date)));
  if (!future.length) throw new Error("No future annual analyst estimate was returned");
  return { current: future[0], following: future[1] ?? null };
}

function auditInputs(symbol: string, priceAsOf: string, stockSessions: number, benchmarkAlignedSessions: number, marketCapRow: NumericRow, income: NumericRow[], cashflow: NumericRow[], balance: NumericRow[]) {
  if (stockSessions < 200) throw new Error(`${symbol}: fewer than 200 completed stock sessions`);
  if (benchmarkAlignedSessions < 64) throw new Error(`${symbol}: fewer than 64 completed stock/QQQ common sessions`);
  if ([income, cashflow, balance].some((rows) => rows.length < 4)) throw new Error(`${symbol}: four quarterly statements are required`);
  const marketCap = numeric(marketCapRow, "marketCap");
  if (!marketCap || marketCap <= 0) throw new Error(`${symbol}: current market capitalization is invalid`);
  const dateSet = (rows: NumericRow[]) => new Set(rows.slice(0, 4).map((row) => String(row.date)));
  const incomeDates = dateSet(income), cashflowDates = dateSet(cashflow), balanceDates = dateSet(balance);
  const sameDates = [...incomeDates].every((date) => cashflowDates.has(date) && balanceDates.has(date)) && incomeDates.size === cashflowDates.size && incomeDates.size === balanceDates.size;
  if (!sameDates) throw new Error(`${symbol}: quarterly statement dates do not match`);
  const currencies = new Set([income, cashflow, balance].flatMap((rows) => rows.slice(0, 4).map((row) => row.reportedCurrency)).filter(Boolean).map(String));
  if (currencies.size > 1) throw new Error(`${symbol}: statement currencies do not match`);
  const marketCapAsOf = String(marketCapRow.date ?? "");
  const warnings = marketCapAsOf !== priceAsOf ? ["market capitalization date differs from latest common price date"] : [];
  return { status: warnings.length ? "WARNING" : "PASS", price_as_of: priceAsOf, market_cap_as_of: marketCapAsOf, financial_as_of: [...incomeDates].sort().at(-1), stock_sessions: stockSessions, benchmark_aligned_sessions: benchmarkAlignedSessions, aligned_sessions: benchmarkAlignedSessions, warnings };
}

async function benchmarkPrices(runtime: AnalysisRuntime, start: string) {
  const cached = await runtime.DB.prepare(`SELECT raw_json,snapshot_at FROM buy_api_snapshots
    WHERE ticker='QQQ' AND dataset='historical_price' ORDER BY snapshot_at DESC LIMIT 1`).first<{ raw_json: string; snapshot_at: string }>();
  if (cached && Date.now() - Date.parse(cached.snapshot_at) < BENCHMARK_CACHE_MS) {
    const rows = JSON.parse(cached.raw_json) as NumericRow[];
    if (isCompletedPriceCacheSafe(rows, cached.snapshot_at)) return { rows, fetched: false };
  }
  return { rows: await fmpGet(runtime.FMP_API_KEY, "historical-price-eod/full", { symbol: "QQQ", from: start }), fetched: true };
}

export async function refreshCandidateAnalysis(runtime: AnalysisRuntime, ticker: string) {
  const symbol = ticker.trim().toUpperCase();
  const candidate = await runtime.DB.prepare(`SELECT ticker,fundamental_stage,fundamental_score,fundamental_metrics_json
    FROM buy_candidates WHERE ticker=? AND active=1`).bind(symbol).first<{
      ticker: string; fundamental_stage: string; fundamental_score: number | null; fundamental_metrics_json: string;
    }>();
  if (!candidate) throw new Error(`${symbol}: active candidate was not found`);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const start = new Date(Date.now() - 450 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [stockPrices, benchmarkResult, estimates, income, cashflow, balance, marketCaps] = await Promise.all([
    fmpGet(runtime.FMP_API_KEY, "historical-price-eod/full", { symbol, from: start }), benchmarkPrices(runtime, start),
    fmpGet(runtime.FMP_API_KEY, "analyst-estimates", { symbol, period: "annual", page: 0, limit: 10 }),
    fmpGet(runtime.FMP_API_KEY, "income-statement", { symbol, period: "quarter", limit: 4 }),
    fmpGet(runtime.FMP_API_KEY, "cash-flow-statement", { symbol, period: "quarter", limit: 4 }),
    fmpGet(runtime.FMP_API_KEY, "balance-sheet-statement", { symbol, period: "quarter", limit: 4 }),
    fmpGet(runtime.FMP_API_KEY, "market-capitalization", { symbol }),
  ]);
  const completedStockPrices = completedUsDailyRows(stockPrices, new Date(now));
  const completedBenchmarkPrices = completedUsDailyRows(benchmarkResult.rows, new Date(now));
  validatePrices(symbol, completedStockPrices);
  validatePrices("QQQ", completedBenchmarkPrices);
  const stockSeries = priceSeries(completedStockPrices);
  const aligned = alignPrices(completedStockPrices, completedBenchmarkPrices);
  const priceAsOf = stockSeries.dates.at(-1)!;
  if (aligned.dates.at(-1) !== priceAsOf) throw new Error(`${symbol}: latest completed QQQ session does not match the stock price date`);
  const overheat = calculateOverheat(stockSeries.closes, aligned.benchmarkCloses, aligned.closes);
  const { current, following } = futureEstimates(estimates, today);
  const marketCapRow = marketCaps[0] ?? {};
  const balanceRow = balance[0] ?? {};
  const marketCap = numeric(marketCapRow, "marketCap") ?? 0;
  const totalDebt = numeric(balanceRow, "totalDebt");
  const cash = numeric(balanceRow, "cashAndCashEquivalents");
  const enterpriseValue = totalDebt !== null && cash !== null ? marketCap + totalDebt - cash : 0;
  const forwardRevenue = numeric(current, "estimatedRevenueAvg", "revenueAvg");
  const nextRevenue = numeric(following ?? {}, "estimatedRevenueAvg", "revenueAvg");
  const forwardEps = numeric(current, "estimatedEpsAvg", "epsAvg");
  const nextEps = numeric(following ?? {}, "estimatedEpsAvg", "epsAvg");
  const revenueGrowth = nextRevenue && forwardRevenue ? nextRevenue / forwardRevenue - 1 : null;
  const epsGrowth = nextEps && forwardEps && forwardEps > 0 ? nextEps / forwardEps - 1 : null;
  const value = calculateValue({ price: overheat.price, marketCap, enterpriseValue, ttmFcf: ttmSum(cashflow, "freeCashFlow") ?? 0, forwardRevenue, forwardEps, revenueGrowth, epsGrowth });

  const previousFundamental = await runtime.DB.prepare(`SELECT fundamental_score FROM fundamental_reference_snapshots
    WHERE ticker=? AND fundamental_score IS NOT NULL ORDER BY received_at DESC LIMIT 1 OFFSET 1`).bind(symbol).first<{ fundamental_score: number }>();
  let fundamentalMetrics: Record<string, unknown> = {};
  try { fundamentalMetrics = JSON.parse(candidate.fundamental_metrics_json) as Record<string, unknown>; } catch { fundamentalMetrics = {}; }
  const fundamentalTrend = deriveFundamentalTrend({
    stage: candidate.fundamental_stage,
    currentScore: candidate.fundamental_score,
    previousScore: previousFundamental?.fundamental_score ?? null,
    metrics: fundamentalMetrics,
  });
  const decision = decideDca(value.score, overheat.score, fundamentalTrend);
  const baseQuality = auditInputs(symbol, priceAsOf, stockSeries.dates.length, aligned.dates.length, marketCapRow, income, cashflow, balance);
  const quality = { ...baseQuality, fundamental_trend: fundamentalTrend, base_dca_multiplier: decision.base_multiplier };
  const previous = await runtime.DB.prepare("SELECT overheat_score FROM buy_analysis_snapshots WHERE ticker=? ORDER BY analyzed_at DESC LIMIT 1").bind(symbol).first<{ overheat_score: number }>();
  const deltaOverheat = previous ? overheat.score - previous.overheat_score : 0;
  const rawDatasets: Array<[string, string, NumericRow[]]> = [
    [symbol, "historical_price", stockPrices], [symbol, "analyst_estimates", estimates], [symbol, "income_quarterly", income],
    [symbol, "cashflow_quarterly", cashflow], [symbol, "balance_quarterly", balance], [symbol, "market_cap", marketCaps],
  ];
  if (benchmarkResult.fetched) rawDatasets.push(["QQQ", "historical_price", benchmarkResult.rows]);
  await runtime.DB.batch([
    ...rawDatasets.map(([rawTicker, dataset, rows]) => runtime.DB.prepare("INSERT INTO buy_api_snapshots (snapshot_at,ticker,dataset,raw_json) VALUES (?,?,?,?)").bind(now, rawTicker, dataset, JSON.stringify(rows))),
    runtime.DB.prepare(`INSERT INTO buy_analysis_snapshots
      (ticker,analyzed_at,price_as_of,price,value_score,overheat_score,delta_overheat,dca_multiplier,action,value_state,overheat_state,value_metrics_json,overheat_metrics_json,data_quality_json,source_version)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(symbol, now, priceAsOf, overheat.price, value.score, overheat.score, deltaOverheat,
      decision.multiplier, decision.action, decision.value_state, decision.overheat_state, JSON.stringify(value), JSON.stringify(overheat), JSON.stringify(quality), SOURCE_VERSION),
  ]);
  return {
    ticker: symbol, analyzed_at: now, price_as_of: priceAsOf, price: overheat.price, value_score: value.score,
    overheat_score: overheat.score, delta_overheat: deltaOverheat, base_dca_multiplier: decision.base_multiplier,
    fundamental_trend: fundamentalTrend, dca_multiplier: decision.multiplier, action: decision.action,
    value_state: decision.value_state, overheat_state: decision.overheat_state, value_metrics: value,
    overheat_metrics: overheat, data_quality: quality,
  };
}
