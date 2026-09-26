export type NumericRow = Record<string, unknown>;

export type OverheatMetrics = {
  price: number; ma20: number; ma50: number; ma200: number; rsi14: number;
  return_1m: number; return_3m: number; return_6m: number; excess_return_3m: number;
  ma20_distance: number; ma50_distance: number; ma200_distance: number;
  ma20_score: number; ma50_score: number; ma200_score: number; ma_extension_score: number;
  rsi_score: number; return_3m_score: number; excess_return_3m_score: number;
  price_acceleration: number; ma_dispersion: number; score: number;
};

export type ValueComponent = {
  status: "valid" | "negative_growth" | "missing";
  score: number | null; reason: string; weight: number;
};

export type ValueMetrics = {
  forward_pe: number | null; peg: number | null; forward_ev_sales: number | null;
  ev_sales_growth: number | null; fcf_yield: number | null; score: number | null;
  available_components: number; total_components: number; coverage_ratio: number; sufficient_data: boolean;
  components: Record<string, ValueComponent>;
  eps_growth: number | null; revenue_growth: number | null; growth_unit: "ratio";
  independent_components: string[]; included_weight: number; sufficiency_reason: string;
};

export type DcaDecision = {
  value_state: string | null; overheat_state: string; base_multiplier: number | null;
  multiplier: number | null; action: "BUY" | "PAUSE" | "REVIEW"; reason: string;
};

const clamp = (value: number, low = 0, high = 100) => Math.max(low, Math.min(high, value));
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const movingAverage = (values: number[], window: number) => values.length >= window ? mean(values.slice(-window)) : null;
const periodReturn = (values: number[], sessions: number) => values.length > sessions && values.at(-sessions - 1) !== 0
  ? values.at(-1)! / values.at(-sessions - 1)! - 1 : null;

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

const finite = (value: number | null): value is number => typeof value === "number" && Number.isFinite(value);
const positive = (value: number | null): value is number => finite(value) && value > 0;

export function forwardGrowth(current: number | null, following: number | null) {
  const growth = positive(current) && finite(following) ? following / current - 1 : null;
  return finite(growth) ? growth : null;
}

export function formatValueScore(score: number | null | undefined) {
  return typeof score === "number" && Number.isFinite(score) ? score.toFixed(1) : "N/A";
}

export function calculateValue(input: {
  price: number; marketCap: number; enterpriseValue: number | null; ttmFcf: number | null;
  forwardRevenue: number | null; forwardEps: number | null; revenueGrowth: number | null; epsGrowth: number | null;
}): ValueMetrics {
  const ratio = (numerator: number | null, denominator: number | null) => {
    const result = finite(numerator) && positive(denominator) ? numerator / denominator : null;
    return finite(result) ? result : null;
  };
  const forwardPe = positive(input.price) ? ratio(input.price, input.forwardEps) : null;
  const forwardEvSales = ratio(input.enterpriseValue, input.forwardRevenue);
  const fcfYield = ratio(input.ttmFcf, input.marketCap);
  const epsGrowth = finite(input.epsGrowth) ? input.epsGrowth : null;
  const revenueGrowth = finite(input.revenueGrowth) ? input.revenueGrowth : null;
  const peg = forwardPe !== 0 && positive(epsGrowth) ? ratio(forwardPe, epsGrowth * 100) : null;
  const evSalesGrowth = forwardEvSales !== 0 && positive(revenueGrowth) ? ratio(forwardEvSales, revenueGrowth * 100) : null;
  const component = (raw: number | null, score: number): ValueComponent => ({
    status: raw === null ? "missing" : "valid", score: raw === null ? null : clamp(score),
    reason: raw === null ? "missing_or_invalid_input" : "calculated", weight: 1,
  });
  const growthComponent = (base: number | null, growth: number | null, raw: number | null, score: number, reason: string): ValueComponent => {
    if (base === null || base === 0 || growth === null || growth === 0) return {
      status: "missing", score: null, weight: 1,
      reason: growth === 0 ? "zero_growth_denominator" : "missing_or_invalid_input",
    };
    if (growth < 0) return { status: "negative_growth", score: 0, weight: 1, reason };
    return component(raw, score);
  };
  const components = {
    forward_pe: component(forwardPe, (60 - (forwardPe ?? 0)) / 50 * 100),
    peg: growthComponent(forwardPe, epsGrowth, peg, (3 - (peg ?? 0)) / 2.5 * 100, "negative_eps_growth"),
    ev_sales_growth: growthComponent(forwardEvSales, revenueGrowth, evSalesGrowth, (0.8 - (evSalesGrowth ?? 0)) / 0.7 * 100, "negative_revenue_growth"),
    fcf_yield: component(fcfYield, (fcfYield ?? 0) / 0.05 * 100),
  };
  const included = Object.values(components).filter((item) => item.score !== null);
  const validCount = Object.values(components).filter((item) => item.status === "valid").length;
  const independent = [forwardPe !== null ? "forward_pe" : null, fcfYield !== null ? "fcf_yield" : null].filter((key): key is string => key !== null);
  const legacyCoverage = validCount >= 3 && (peg !== null || evSalesGrowth !== null);
  const sufficientData = legacyCoverage || independent.length === 2;
  return {
    forward_pe: forwardPe, peg, forward_ev_sales: forwardEvSales, ev_sales_growth: evSalesGrowth,
    fcf_yield: fcfYield, score: sufficientData ? mean(included.map((item) => item.score!)) : null, available_components: included.length,
    total_components: 4, coverage_ratio: included.length / 4, sufficient_data: sufficientData,
    components, eps_growth: epsGrowth, revenue_growth: revenueGrowth, growth_unit: "ratio",
    independent_components: independent, included_weight: included.length,
    sufficiency_reason: legacyCoverage ? "existing_valid_coverage" : sufficientData ? "forward_pe_and_fcf_yield" : "insufficient_data",
  };
}

export function decideDca(valueScore: number | null, overheatScore: number): DcaDecision {
  const overheatState = overheatScore < 25 ? "LOW" : overheatScore < 50 ? "NORMAL" : overheatScore < 75 ? "HIGH" : "EXTREME";
  const valueState = valueScore === null ? null : valueScore >= 70 ? "VERY_UNDERVALUED" : valueScore >= 60 ? "UNDERVALUED" : valueScore >= 40 ? "FAIR" : valueScore >= 20 ? "OVERVALUED" : "EXTREME_OVERVALUED";
  if (!valueState) return { value_state: null, overheat_state: overheatState, base_multiplier: null, multiplier: null, action: "REVIEW", reason: "Value data coverage is insufficient" };
  const matrix: Record<string, Record<string, number>> = {
    VERY_UNDERVALUED: { LOW: 1.5, NORMAL: 1, HIGH: 0.5, EXTREME: 0 },
    UNDERVALUED: { LOW: 1, NORMAL: 1, HIGH: 0.5, EXTREME: 0 },
    FAIR: { LOW: 1, NORMAL: 1, HIGH: 0.5, EXTREME: 0 },
    OVERVALUED: { LOW: 0.5, NORMAL: 0.5, HIGH: 0, EXTREME: 0 },
    EXTREME_OVERVALUED: { LOW: 0, NORMAL: 0, HIGH: 0, EXTREME: 0 },
  };
  const baseMultiplier = matrix[valueState][overheatState];
  return {
    value_state: valueState, overheat_state: overheatState, base_multiplier: baseMultiplier, multiplier: baseMultiplier,
    action: baseMultiplier === 0 ? "PAUSE" : "BUY",
    reason: `${valueState} value, ${overheatState} overheat`,
  };
}

export function numeric(row: NumericRow, ...keys: string[]) {
  for (const key of keys) if (typeof row[key] === "number" && Number.isFinite(row[key])) return row[key] as number;
  return null;
}
