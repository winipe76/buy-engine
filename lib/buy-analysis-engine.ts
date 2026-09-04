export type NumericRow = Record<string, unknown>;

export type OverheatMetrics = {
  price: number; ma20: number; ma50: number; ma200: number; rsi14: number;
  return_1m: number; return_3m: number; return_6m: number; excess_return_3m: number;
  ma20_distance: number; ma50_distance: number; ma200_distance: number;
  ma20_score: number; ma50_score: number; ma200_score: number; ma_extension_score: number;
  rsi_score: number; return_3m_score: number; excess_return_3m_score: number;
  price_acceleration: number; ma_dispersion: number; score: number;
};

export type ValueMetrics = {
  forward_pe: number | null; peg: number | null; forward_ev_sales: number | null;
  ev_sales_growth: number | null; fcf_yield: number | null; score: number | null;
  available_components: number; total_components: number; coverage_ratio: number; sufficient_data: boolean;
};

export type FundamentalTrendState = "IMPROVING" | "STABLE" | "SLOWING" | "DETERIORATING";

export type FundamentalTrend = {
  state: FundamentalTrendState;
  adjustment: -1 | -0.5 | 0 | 0.5;
  reason: string;
};

export type DcaDecision = {
  fundamental_context: "TREND_ADJUSTMENT"; value_state: string | null; overheat_state: string;
  base_multiplier: number | null; fundamental_trend: FundamentalTrend;
  multiplier: number | null; action: "BUY" | "PAUSE" | "REVIEW"; reason: string;
};

const clamp = (value: number, low = 0, high = 100) => Math.max(low, Math.min(high, value));
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const movingAverage = (values: number[], window: number) => values.length >= window ? mean(values.slice(-window)) : null;
const periodReturn = (values: number[], sessions: number) => values.length > sessions && values.at(-sessions - 1) !== 0
  ? values.at(-1)! / values.at(-sessions - 1)! - 1 : null;

function normalizeTrendText(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[\s_-]+/g, " ") : "";
}

export function deriveFundamentalTrend(input: {
  stage?: string | null;
  currentScore?: number | null;
  previousScore?: number | null;
  metrics?: Record<string, unknown> | null;
}): FundamentalTrend {
  const metrics = input.metrics ?? {};
  const explicitKeys = ["fundamental_trend", "guidance_trend", "guidance_revision", "growth_trend", "outlook_trend"];
  const explicit = explicitKeys.map((key) => normalizeTrendText(metrics[key])).find(Boolean) ?? "";

  if (/deteriorat|material decline|sharp decline|급격|악화/.test(explicit)) {
    return { state: "DETERIORATING", adjustment: -1, reason: `Explicit fundamental/guidance trend: ${explicit}` };
  }
  if (/down|lower|cut|slow|deceler|하향|둔화/.test(explicit)) {
    return { state: "SLOWING", adjustment: -0.5, reason: `Explicit fundamental/guidance trend: ${explicit}` };
  }
  if (/up|raise|improv|acceler|상향|개선/.test(explicit)) {
    return { state: "IMPROVING", adjustment: 0.5, reason: `Explicit fundamental/guidance trend: ${explicit}` };
  }

  if (input.currentScore !== null && input.currentScore !== undefined && input.previousScore !== null && input.previousScore !== undefined) {
    const scoreDelta = input.currentScore - input.previousScore;
    if (scoreDelta <= -10) return { state: "DETERIORATING", adjustment: -1, reason: `Fundamental score fell ${Math.abs(scoreDelta).toFixed(1)} points` };
    if (scoreDelta <= -3) return { state: "SLOWING", adjustment: -0.5, reason: `Fundamental score fell ${Math.abs(scoreDelta).toFixed(1)} points` };
    if (scoreDelta >= 5) return { state: "IMPROVING", adjustment: 0.5, reason: `Fundamental score rose ${scoreDelta.toFixed(1)} points` };
  }

  if (input.stage === "caution" || input.stage === "excluded") {
    return { state: "DETERIORATING", adjustment: -1, reason: `Fundamental stage is ${input.stage}` };
  }
  if (input.stage === "watch") {
    return { state: "SLOWING", adjustment: -0.5, reason: "Fundamental stage is watch" };
  }

  return { state: "STABLE", adjustment: 0, reason: "No confirmed guidance/fundamental deterioration signal" };
}

export function calculateRsi(values: number[], window = 14) {
  if (values.length <= window) return null;
  const changes = values.slice(1).map((value, index) => value - values[index]);
  let averageGain = mean(changes.slice(0, window).map((change) => Math.max(change, 0)));
  let averageLoss = mean(changes.slice(0, window).map((change) => Math.max(-change, 0)));
  for (const change of changes.slice(window)) {
    averageGain = (averageGain * (window - 1) + Math.max(change, 0)) / window;
    averageLoss = (averageLoss * (window - 1) + Math.max(-change, 0)) / window;
  }
  if (averageLoss === 0) return averageGain > 0 ? 100 : 50;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

export function calculateOverheat(closes: number[], benchmarkCloses: number[], benchmarkStockCloses: number[] = closes): OverheatMetrics {
  if (closes.length < 200 || benchmarkCloses.length < 64 || benchmarkStockCloses.length < 64) throw new Error("At least 200 stock and 64 aligned benchmark closes are required");
  if (benchmarkCloses.length !== benchmarkStockCloses.length) throw new Error("Benchmark and aligned stock histories must have equal lengths");
  if ([...closes, ...benchmarkCloses, ...benchmarkStockCloses].some((value) => !Number.isFinite(value) || value <= 0)) throw new Error("Close prices must be positive finite numbers");
  const price = closes.at(-1)!;
  const ma20 = movingAverage(closes, 20)!;
  const ma50 = movingAverage(closes, 50)!;
  const ma200 = movingAverage(closes, 200)!;
  const rsi14 = calculateRsi(closes, 14)!;
  const return1m = periodReturn(closes, 21)!;
  const return3m = periodReturn(closes, 63)!;
  const return6m = periodReturn(closes, 126)!;
  const alignedStock3m = periodReturn(benchmarkStockCloses, 63)!;
  const benchmark3m = periodReturn(benchmarkCloses, 63)!;
  const excessReturn3m = alignedStock3m - benchmark3m;
  const ma20Distance = price / ma20 - 1;
  const ma50Distance = price / ma50 - 1;
  const ma200Distance = price / ma200 - 1;
  const ma20Score = clamp(ma20Distance / 0.20 * 100);
  const ma50Score = clamp(ma50Distance / 0.35 * 100);
  const ma200Score = clamp(ma200Distance / 0.60 * 100);
  const maExtensionScore = ma20Score * 0.40 + ma50Score * 0.40 + ma200Score * 0.20;
  const rsiScore = clamp((rsi14 - 50) / 30 * 100);
  const return3mScore = clamp(return3m / 0.50 * 100);
  const excessReturn3mScore = clamp(excessReturn3m / 0.30 * 100);
  const score = maExtensionScore * 0.40 + rsiScore * 0.20 + return3mScore * 0.20 + excessReturn3mScore * 0.20;
  return {
    price, ma20, ma50, ma200, rsi14, return_1m: return1m, return_3m: return3m, return_6m: return6m,
    excess_return_3m: excessReturn3m, ma20_distance: ma20Distance, ma50_distance: ma50Distance, ma200_distance: ma200Distance,
    ma20_score: ma20Score, ma50_score: ma50Score, ma200_score: ma200Score, ma_extension_score: maExtensionScore,
    rsi_score: rsiScore, return_3m_score: return3mScore, excess_return_3m_score: excessReturn3mScore,
    price_acceleration: return1m - return3m / 3,
    ma_dispersion: Math.max(ma20, ma50, ma200) / Math.min(ma20, ma50, ma200) - 1, score,
  };
}

export function calculateValue(input: {
  price: number; marketCap: number; enterpriseValue: number; ttmFcf: number;
  forwardRevenue: number | null; forwardEps: number | null; revenueGrowth: number | null; epsGrowth: number | null;
}): ValueMetrics {
  const forwardPe = input.forwardEps && input.forwardEps > 0 ? input.price / input.forwardEps : null;
  const peg = forwardPe && input.epsGrowth && input.epsGrowth > 0 ? forwardPe / (input.epsGrowth * 100) : null;
  const forwardEvSales = input.forwardRevenue && input.forwardRevenue > 0 ? input.enterpriseValue / input.forwardRevenue : null;
  const evSalesGrowth = forwardEvSales && input.revenueGrowth && input.revenueGrowth > 0 ? forwardEvSales / (input.revenueGrowth * 100) : null;
  const fcfYield = input.marketCap > 0 ? input.ttmFcf / input.marketCap : null;
  const components: number[] = [];
  if (forwardPe !== null) components.push(clamp((60 - forwardPe) / 50 * 100));
  if (peg !== null) components.push(clamp((3 - peg) / 2.5 * 100));
  if (evSalesGrowth !== null) components.push(clamp((0.8 - evSalesGrowth) / 0.7 * 100));
  if (fcfYield !== null) components.push(clamp(fcfYield / 0.05 * 100));
  const sufficientData = components.length >= 3 && (peg !== null || evSalesGrowth !== null);
  return {
    forward_pe: forwardPe, peg, forward_ev_sales: forwardEvSales, ev_sales_growth: evSalesGrowth,
    fcf_yield: fcfYield, score: sufficientData ? mean(components) : null, available_components: components.length,
    total_components: 4, coverage_ratio: components.length / 4, sufficient_data: sufficientData,
  };
}

export function decideDca(valueScore: number | null, overheatScore: number, fundamentalTrend: FundamentalTrend = { state: "STABLE", adjustment: 0, reason: "No fundamental trend input" }): DcaDecision {
  const overheatState = overheatScore < 25 ? "LOW" : overheatScore < 50 ? "NORMAL" : overheatScore < 75 ? "HIGH" : "EXTREME";
  const valueState = valueScore === null ? null : valueScore >= 80 ? "VERY_UNDERVALUED" : valueScore >= 60 ? "UNDERVALUED" : valueScore >= 40 ? "FAIR" : valueScore >= 20 ? "OVERVALUED" : "EXTREME_OVERVALUED";
  if (!valueState) return { fundamental_context: "TREND_ADJUSTMENT", value_state: null, overheat_state: overheatState, base_multiplier: null, fundamental_trend: fundamentalTrend, multiplier: null, action: "REVIEW", reason: "Value data coverage is insufficient" };
  const matrix: Record<string, Record<string, number>> = {
    VERY_UNDERVALUED: { LOW: 1.5, NORMAL: 1.5, HIGH: 1, EXTREME: 0.5 },
    UNDERVALUED: { LOW: 1.5, NORMAL: 1, HIGH: 0.5, EXTREME: 0 },
    FAIR: { LOW: 1, NORMAL: 1, HIGH: 0.5, EXTREME: 0 },
    OVERVALUED: { LOW: 0.5, NORMAL: 0.5, HIGH: 0, EXTREME: 0 },
    EXTREME_OVERVALUED: { LOW: 0, NORMAL: 0, HIGH: 0, EXTREME: 0 },
  };
  const baseMultiplier = matrix[valueState][overheatState];
  const multiplier = clamp(baseMultiplier + fundamentalTrend.adjustment, 0, 1.5);
  return {
    fundamental_context: "TREND_ADJUSTMENT", value_state: valueState, overheat_state: overheatState,
    base_multiplier: baseMultiplier, fundamental_trend: fundamentalTrend, multiplier,
    action: multiplier === 0 ? "PAUSE" : "BUY",
    reason: `${valueState} value, ${overheatState} overheat; Fundamental trend ${fundamentalTrend.state} (${fundamentalTrend.adjustment >= 0 ? "+" : ""}${fundamentalTrend.adjustment.toFixed(1)}x)`,
  };
}

export function numeric(row: NumericRow, ...keys: string[]) {
  for (const key of keys) if (typeof row[key] === "number" && Number.isFinite(row[key])) return row[key] as number;
  return null;
}
