"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Tone = "positive" | "caution" | "negative" | "neutral";
type Action = "BUY" | "LIGHT BUY" | "PAUSE" | "REVIEW";
type SortKey = "symbol" | "value" | "overheat" | "deltaOverheat" | "multiplier" | "action";

type ComponentMetric = {
  label: string;
  value: string;
  note: string;
  tone: Tone;
};

type Company = {
  symbol: string;
  name: string;
  price: number;
  fundamentalStage: FundamentalStage | "unavailable";
  fundamentalScore: number | null;
  fundamentalUpdatedAt: string | null;
  value: number;
  overheat: number;
  deltaOverheat: number;
  multiplier: number | null;
  action: Action;
  actionTone: Tone;
  summary: string;
  valueState: string;
  overheatState: string;
  valueMetrics: ComponentMetric[];
  overheatMetrics: ComponentMetric[];
};

const companies: Company[] = [
  {
    symbol: "NVDA",
    name: "NVIDIA",
    price: 220.05,
    fundamentalStage: "unavailable",
    fundamentalScore: null,
    fundamentalUpdatedAt: null,
    value: 70.5,
    overheat: 13.8,
    deltaOverheat: 0.46,
    multiplier: 1.5,
    action: "BUY",
    actionTone: "positive",
    summary: "Value는 매력 구간, Overheat는 낮은 구간입니다. 현재 규칙은 기본 DCA보다 적극적인 매수를 제안합니다.",
    valueState: "UNDERVALUED",
    overheatState: "LOW · HEATING",
    valueMetrics: [
      { label: "FCF Yield", value: "2.24%", note: "TTM FCF / 현재 시가총액", tone: "neutral" },
      { label: "Forward P/E", value: "24.5×", note: "FY27 EPS 컨센서스", tone: "positive" },
      { label: "Forward PEG", value: "0.58×", note: "EPS 성장률 조정", tone: "positive" },
      { label: "EV/Sales ÷ Growth", value: "0.31×", note: "매출 성장률 조정", tone: "positive" },
    ],
    overheatMetrics: [
      { label: "MA200 Distance", value: "+13.2%", note: "현재가 / 200DMA", tone: "neutral" },
      { label: "Price Acceleration", value: "+8.0%p", note: "1M − 3M 월평균", tone: "caution" },
      { label: "Relative Strength", value: "−0.9%p", note: "3M vs QQQ", tone: "positive" },
      { label: "RSI14 (Wilder)", value: "56.0", note: "Daily Close · 14거래일", tone: "neutral" },
      { label: "MA Dispersion", value: "7.0%", note: "MA20·50·200 분산", tone: "neutral" },
    ],
  },
  {
    symbol: "PLTR",
    name: "Palantir",
    price: 176.16,
    fundamentalStage: "unavailable",
    fundamentalScore: null,
    fundamentalUpdatedAt: null,
    value: 8.0,
    overheat: 87.8,
    deltaOverheat: -0.15,
    multiplier: 0,
    action: "PAUSE",
    actionTone: "caution",
    summary: "Value 부담과 극단적 Overheat가 겹쳐 신규 매수를 중단합니다. Fundamental Trend 보정 후에도 DCA는 0×입니다.",
    valueState: "EXTREME OVERVALUED",
    overheatState: "EXTREME · COOLING",
    valueMetrics: [
      { label: "FCF Yield", value: "0.83%", note: "TTM FCF / 현재 시가총액", tone: "negative" },
      { label: "Forward P/E", value: "110.9×", note: "FY26 EPS 컨센서스", tone: "negative" },
      { label: "Forward PEG", value: "2.61×", note: "EPS 성장률 조정", tone: "caution" },
      { label: "EV/Sales ÷ Growth", value: "1.00×", note: "매출 성장률 조정", tone: "negative" },
    ],
    overheatMetrics: [
      { label: "MA200 Distance", value: "+15.7%", note: "현재가 / 200DMA", tone: "caution" },
      { label: "Price Acceleration", value: "+25.9%p", note: "1M − 3M 월평균", tone: "negative" },
      { label: "Relative Strength", value: "+27.5%p", note: "3M vs QQQ", tone: "negative" },
      { label: "RSI14 (Wilder)", value: "79.7", note: "Daily Close · 14거래일", tone: "negative" },
      { label: "MA Dispersion", value: "13.9%", note: "MA20·50·200 분산", tone: "caution" },
    ],
  },
];

const actionRank: Record<Action, number> = { BUY: 3, "LIGHT BUY": 2, PAUSE: 1, REVIEW: 0 };

function formatPrice(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatDelta(value: number) {
  const arrow = value > 0 ? "↑" : value < 0 ? "↓" : "→";
  const sign = value > 0 ? "+" : "";
  return `${arrow} ${sign}${value.toFixed(2)}`;
}

function formatMultiplier(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}×`;
}

function SortButton({ label, sortKey, active, direction, onSort }: {
  label: string; sortKey: SortKey; active: boolean; direction: "asc" | "desc"; onSort: (key: SortKey) => void;
}) {
  return (
    <button className={`sort-button ${active ? "active" : ""}`} onClick={() => onSort(sortKey)} type="button">
      {label}<span aria-hidden="true">{active ? (direction === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>
  );
}

function ScoreGauge({ label, score, tone }: { label: string; score: number; tone: Tone }) {
  return (
    <div className="gauge">
      <div className="gauge-head"><span>{label}</span><strong>{score.toFixed(1)}</strong></div>
      <div className="gauge-track"><span className={`gauge-fill fill-${tone}`} style={{ width: `${score}%` }} /></div>
    </div>
  );
}

function MetricPanel({ title, subtitle, metrics, score, tone }: {
  title: string; subtitle: string; metrics: ComponentMetric[]; score: number; tone: Tone;
}) {
  return (
    <section className="metric-panel">
      <div className="panel-title">
        <div><span>COMPONENTS</span><h3>{title}</h3></div>
        <div className={`state-pill tone-${tone}`}>{subtitle}</div>
      </div>
      <ScoreGauge label={`${title} Score`} score={score} tone={tone} />
      <div className="component-list">
        {metrics.map((metric) => (
          <div className="component-row" key={metric.label}>
            <div><strong>{metric.label}</strong><span>{metric.note}</span></div>
            <b className={`metric-value text-${metric.tone}`}>{metric.value}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

type FundamentalStage = "newly_selected" | "continuing_improvement" | "watch" | "caution" | "excluded";
type CandidateApiRecord = {
  ticker: string; company_name: string; active: number | boolean; fundamental_stage: FundamentalStage;
  fundamental_score: number | null; fundamental_updated_at: string; source_snapshot_date: string;
  added_at: string; deactivated_at: string | null; reactivated_at: string | null;
  analyzed_at: string | null; price_as_of: string | null; price: number | null; value_score: number | null;
  overheat_score: number | null; delta_overheat: number | null; dca_multiplier: number | null; action: Action | null;
  value_state: string | null; overheat_state: string | null; value_metrics_json: string | null;
  overheat_metrics_json: string | null; data_quality_json: string | null;
};

const stageLabels: Record<FundamentalStage | "unavailable", string> = {
  newly_selected: "신규 선정", continuing_improvement: "지속 개선", watch: "관찰",
  caution: "주의", excluded: "제외", unavailable: "정보 없음",
};

function initialCandidateMessage() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const status = params.get("candidate_status");
  const analysisStatus = params.get("analysis_status");
  const ticker = params.get("ticker") ?? "종목";
  if (analysisStatus === "error") return params.get("candidate_message") ?? `${ticker} 후보는 등록됐지만 지표 계산에 실패했습니다.`;
  if (analysisStatus === "updated") return `${ticker} 후보 등록과 Buy Engine 지표 계산이 완료되었습니다.`;
  if (status === "added") return `${ticker} 후보 등록이 완료되었습니다.`;
  if (status === "reactivated") return `${ticker} 후보를 재활성화하고 Fundamental Snapshot을 갱신했습니다.`;
  if (status === "updated") return `${ticker} 후보의 Fundamental Snapshot을 최신 값으로 갱신했습니다.`;
  if (status === "error") return params.get("candidate_message") ?? "후보 등록에 실패했습니다.";
  return "";
}

function useCandidateRegistry() {
  const [candidates, setCandidates] = useState<CandidateApiRecord[]>([]);
  const [status, setStatus] = useState<"loading" | "connected" | "error">("loading");
  const [view, setView] = useState<"active" | "inactive">("active");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const load = useCallback(async (nextView: "active" | "inactive" = view) => {
    try {
      const response = await fetch(`/api/candidates?status=${nextView}`, { cache: "no-store" });
      const payload = await response.json();
      setCandidates(Array.isArray(payload.candidates) ? payload.candidates : []);
      setStatus(response.ok ? "connected" : "error");
    } catch { setStatus("error"); }
  }, [view]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  const setActive = useCallback(async (ticker: string, active: boolean) => {
    const response = await fetch("/api/candidates", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker, active }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "후보 상태를 변경하지 못했습니다.");
    await load();
  }, [load]);
  const refreshAll = useCallback(async () => {
    if (view !== "active" || !candidates.length) return;
    setRefreshing(true);
    setRefreshMessage(`0/${candidates.length} 지표 업데이트 중`);
    const failures: string[] = [];
    try {
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        try {
          const response = await fetch("/api/analysis/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker: candidate.ticker }) });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error ?? "지표 계산 실패");
        } catch { failures.push(candidate.ticker); }
        setRefreshMessage(`${index + 1}/${candidates.length} 지표 업데이트 중`);
      }
      await load("active");
      setRefreshMessage(failures.length ? `업데이트 완료 · 실패: ${failures.join(", ")}` : `${candidates.length}개 종목 지표 업데이트 완료`);
    } finally { setRefreshing(false); }
  }, [candidates, load, view]);
  const changeView = useCallback((next: "active" | "inactive") => { setView(next); setCandidates([]); }, []);
  return { candidates, status, view, changeView, setActive, refreshing, refreshMessage, refreshAll };
}

function CandidateControl({ registry }: { registry: ReturnType<typeof useCandidateRegistry> }) {
  return <div className="candidate-control"><div><strong>후보 상태</strong><span>{registry.refreshMessage || (registry.status === "connected" ? `${registry.candidates.length}개 · Fundamental Snapshot 연동` : registry.status === "loading" ? "후보 목록 불러오는 중" : "후보 DB 연결 필요")}</span></div><div className="candidate-tags">{registry.candidates.slice(0, 8).map(candidate => <span key={candidate.ticker}>{candidate.ticker}<small>{stageLabels[candidate.fundamental_stage]}</small></span>)}</div><div className="candidate-actions"><button className="analysis-refresh-button" disabled={registry.refreshing || registry.view !== "active" || !registry.candidates.length} onClick={() => void registry.refreshAll()}>{registry.refreshing ? "업데이트 중…" : "지표 업데이트"}</button><div className="candidate-view-toggle"><button className={registry.view === "active" ? "selected" : ""} onClick={() => registry.changeView("active")}>Active</button><button className={registry.view === "inactive" ? "selected" : ""} onClick={() => registry.changeView("inactive")}>Inactive Candidates</button></div></div></div>;
}

function parsedMetrics(value: string | null) {
  if (!value) return {} as Record<string, unknown>;
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {}; }
  catch { return {} as Record<string, unknown>; }
}

function metricNumber(metrics: Record<string, unknown>, key: string) {
  const value = metrics[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function analyzedCompany(candidate: CandidateApiRecord, reference: Pick<Company, "fundamentalStage" | "fundamentalScore" | "fundamentalUpdatedAt">): Company | null {
  if (!candidate.analyzed_at || candidate.price === null || candidate.overheat_score === null) return null;
  const value = parsedMetrics(candidate.value_metrics_json);
  const overheat = parsedMetrics(candidate.overheat_metrics_json);
  const forwardPe = metricNumber(value, "forward_pe"), peg = metricNumber(value, "peg"), evSalesGrowth = metricNumber(value, "ev_sales_growth"), fcfYield = metricNumber(value, "fcf_yield");
  const price = candidate.price;
  const ma20 = metricNumber(overheat, "ma20"), ma50 = metricNumber(overheat, "ma50"), ma200 = metricNumber(overheat, "ma200");
  const ma20Distance = metricNumber(overheat, "ma20_distance") ?? (ma20 ? price / ma20 - 1 : null);
  const ma50Distance = metricNumber(overheat, "ma50_distance") ?? (ma50 ? price / ma50 - 1 : null);
  const ma200Distance = metricNumber(overheat, "ma200_distance") ?? (ma200 ? price / ma200 - 1 : null);
  const rsi14 = metricNumber(overheat, "rsi14"), return3m = metricNumber(overheat, "return_3m"), relativeStrength = metricNumber(overheat, "excess_return_3m");
  const action = candidate.action ?? "REVIEW";
  const actionTone: Tone = action === "BUY" ? "positive" : action === "PAUSE" ? "caution" : "neutral";
  const delta = candidate.delta_overheat ?? 0;
  return {
    symbol: candidate.ticker, name: candidate.company_name, price, ...reference,
    value: candidate.value_score ?? 0, overheat: candidate.overheat_score, deltaOverheat: delta,
    multiplier: candidate.dca_multiplier, action, actionTone,
    summary: `FMP 기준 ${candidate.price_as_of ?? "최신"} 데이터로 계산했습니다. Value ${candidate.value_score?.toFixed(1) ?? "산출 불가"}, Overheat ${candidate.overheat_score.toFixed(1)}, DCA ${formatMultiplier(candidate.dca_multiplier)}입니다.`,
    valueState: candidate.value_state ?? "INSUFFICIENT DATA",
    overheatState: `${candidate.overheat_state ?? "PENDING"} · ${delta > 0 ? "HEATING" : delta < 0 ? "COOLING" : "STABLE"}`,
    valueMetrics: [
      { label: "FCF Yield", value: fcfYield === null ? "산출 불가" : `${(fcfYield * 100).toFixed(2)}%`, note: "TTM FCF / 현재 시가총액", tone: fcfYield !== null && fcfYield >= .03 ? "positive" : "neutral" },
      { label: "Forward P/E", value: forwardPe === null ? "산출 불가" : `${forwardPe.toFixed(1)}배`, note: "FY1 EPS 컨센서스", tone: forwardPe !== null && forwardPe <= 30 ? "positive" : "caution" },
      { label: "Forward PEG", value: peg === null ? "산출 불가" : `${peg.toFixed(2)}배`, note: "EPS 성장률 조정", tone: peg !== null && peg <= 1 ? "positive" : "caution" },
      { label: "EV/Sales ÷ Growth", value: evSalesGrowth === null ? "산출 불가" : `${evSalesGrowth.toFixed(2)}배`, note: "매출 성장률 조정", tone: evSalesGrowth !== null && evSalesGrowth <= .4 ? "positive" : "caution" },
    ],
    overheatMetrics: [
      { label: "MA20 Distance", value: ma20Distance === null ? "산출 불가" : `${(ma20Distance * 100).toFixed(1)}%`, note: "MA Extension 40% · 총점 16%", tone: ma20Distance !== null && ma20Distance > .15 ? "caution" : "neutral" },
      { label: "MA50 Distance", value: ma50Distance === null ? "산출 불가" : `${(ma50Distance * 100).toFixed(1)}%`, note: "MA Extension 40% · 총점 16%", tone: ma50Distance !== null && ma50Distance > .25 ? "caution" : "neutral" },
      { label: "MA200 Distance", value: ma200Distance === null ? "산출 불가" : `${(ma200Distance * 100).toFixed(1)}%`, note: "MA Extension 20% · 총점 8%", tone: ma200Distance !== null && ma200Distance > .40 ? "caution" : "neutral" },
      { label: "RSI14 (Wilder)", value: rsi14 === null ? "산출 불가" : rsi14.toFixed(1), note: `Overheat 20% · 확정 종가 ${candidate.price_as_of ?? "기준일 없음"}`, tone: rsi14 !== null && rsi14 >= 70 ? "negative" : "neutral" },
      { label: "3M Momentum", value: return3m === null ? "산출 불가" : `${(return3m * 100).toFixed(1)}%`, note: "63거래일 수익률 · 총점 20%", tone: return3m !== null && return3m > .35 ? "caution" : "neutral" },
      { label: "QQQ Excess Return", value: relativeStrength === null ? "산출 불가" : `${(relativeStrength * 100).toFixed(1)}%p`, note: "공통 63거래일 · 총점 20%", tone: relativeStrength !== null && relativeStrength > .15 ? "caution" : "neutral" },
    ],
  };
}

export default function Home() {
  const registry = useCandidateRegistry();
  const [filter, setFilter] = useState<"ALL" | Action>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("multiplier");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [selectedSymbol, setSelectedSymbol] = useState("NVDA");
  const [candidateMessage, setCandidateMessage] = useState(initialCandidateMessage);

  const resolvedCompanies = useMemo(() => registry.candidates.map((candidate) => {
    const sample = companies.find((company) => company.symbol === candidate.ticker);
    const reference = {
      fundamentalStage: candidate.fundamental_stage,
      fundamentalScore: candidate.fundamental_score,
      fundamentalUpdatedAt: candidate.fundamental_updated_at,
    };
    const live = analyzedCompany(candidate, reference);
    if (live) return live;
    if (sample) return { ...sample, ...reference };
    return {
      ...companies[0], ...reference, symbol: candidate.ticker, name: candidate.company_name, price: 0,
      value: 0, overheat: 0, deltaOverheat: 0, multiplier: null, action: "REVIEW" as Action,
      actionTone: "neutral" as Tone, summary: "후보 등록은 완료되었습니다. 다음 Buy Engine 갱신에서 Value·Overheat·DCA가 계산됩니다.",
      valueState: "PENDING", overheatState: "PENDING", valueMetrics: [], overheatMetrics: [],
    };
  }), [registry.candidates]);

  const visibleCompanies = useMemo(() => {
    const filtered = filter === "ALL" ? resolvedCompanies : resolvedCompanies.filter((company) => company.action === filter);
    return [...filtered].sort((a, b) => {
      const values: Record<SortKey, [string | number, string | number]> = {
        symbol: [a.symbol, b.symbol], value: [a.value, b.value], overheat: [a.overheat, b.overheat],
        deltaOverheat: [a.deltaOverheat, b.deltaOverheat], multiplier: [a.multiplier ?? -1, b.multiplier ?? -1],
        action: [actionRank[a.action], actionRank[b.action]],
      };
      const [left, right] = values[sortKey];
      const result = typeof left === "string" ? left.localeCompare(String(right)) : left - Number(right);
      return direction === "asc" ? result : -result;
    });
  }, [filter, sortKey, direction, resolvedCompanies]);

  const selected = resolvedCompanies.find((company) => company.symbol === selectedSymbol) ?? resolvedCompanies[0] ?? null;

  function handleSort(key: SortKey) {
    if (sortKey === key) setDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSortKey(key); setDirection("desc"); }
  }

  async function changeCandidateState(ticker: string, active: boolean) {
    if (!active && !window.confirm(`${ticker}를 비활성화할까요? 기존 분석 이력은 삭제되지 않습니다.`)) return;
    setCandidateMessage("");
    try {
      await registry.setActive(ticker, active);
      setCandidateMessage(active ? `${ticker} 재활성화 완료` : `${ticker} 비활성화 완료 · 이력은 유지됩니다.`);
    } catch (error) {
      setCandidateMessage(error instanceof Error ? error.message : "후보 상태 변경 실패");
    }
  }

  return (
    <main>
      <header className="site-header">
        <div className="brand"><div className="brand-mark">B</div><div><strong>BUY ENGINE</strong><span>지금 사도 되는가 · 얼마나 살 것인가</span></div></div>
        <div className="status-cluster"><span className="live-dot" /><div><strong>DATA QUALITY PASS</strong><span>2026.08.11 · FMP Starter</span></div></div>
      </header>

      <section className="hero compact-hero">
        <div><p className="eyebrow">PORTFOLIO BUY OVERVIEW</p><h1>매수 판단을<br /><em>한눈에.</em></h1></div>
        <div className="role-note"><span>ROLE</span><strong>Fundamental Trend로 DCA 보정</strong><p>Value + Overheat 기본 DCA에 성장과 가이던스 추세를 ±0.5~1.0× 반영합니다.</p></div>
      </section>

      <section className="overview-card" aria-labelledby="overview-title">
        <div className="overview-toolbar">
          <div><span className="section-kicker">ALL SYMBOLS</span><h2 id="overview-title">Buy Overview</h2></div>
          <div className="filter-group" aria-label="Action 필터">
            {(["ALL", "BUY", "LIGHT BUY", "PAUSE", "REVIEW"] as const).map((item) => (
              <button key={item} type="button" className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}</button>
            ))}
          </div>
        </div>

        <CandidateControl registry={registry} />

        <div className="table-scroll">
          <table>
            <thead><tr>
              <th><SortButton label="Ticker" sortKey="symbol" active={sortKey === "symbol"} direction={direction} onSort={handleSort} /></th>
              <th>Price</th><th>Fundamental Stage</th><th>Fundamental Score</th>
              <th><SortButton label="Value" sortKey="value" active={sortKey === "value"} direction={direction} onSort={handleSort} /></th>
              <th><SortButton label="Overheat" sortKey="overheat" active={sortKey === "overheat"} direction={direction} onSort={handleSort} /></th>
              <th><SortButton label="ΔOverheat" sortKey="deltaOverheat" active={sortKey === "deltaOverheat"} direction={direction} onSort={handleSort} /></th>
              <th><SortButton label="DCA Multiplier" sortKey="multiplier" active={sortKey === "multiplier"} direction={direction} onSort={handleSort} /></th>
              <th><SortButton label="Action" sortKey="action" active={sortKey === "action"} direction={direction} onSort={handleSort} /></th>
              <th>Candidate</th>
            </tr></thead>
            <tbody>
              {visibleCompanies.map((company) => (
                <tr key={company.symbol} className={selected?.symbol === company.symbol ? "active-row" : ""} onClick={() => setSelectedSymbol(company.symbol)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedSymbol(company.symbol); }} aria-label={`${company.symbol} 상세 보기`}>
                  <td><div className="table-symbol"><span className={`mini-ticker ticker-${company.symbol.toLowerCase()}`}>{company.symbol[0]}</span><div><strong>{company.symbol}</strong><small>{company.name}</small></div></div></td>
                  <td className="numeric">{formatPrice(company.price)}</td>
                  <td><span className={`stage-pill stage-${company.fundamentalStage}`}>{stageLabels[company.fundamentalStage]}</span><small className="reference-date">{company.fundamentalUpdatedAt ? new Date(company.fundamentalUpdatedAt).toLocaleDateString("ko-KR") : "—"}</small></td>
                  <td><strong className="fundamental-score">{company.fundamentalScore?.toFixed(1) ?? "—"}</strong></td>
                  <td><span className={`score-number ${company.value < 20 ? "low" : "good"}`}>{company.value.toFixed(1)}</span></td>
                  <td><span className={`score-number ${company.overheat >= 75 ? "hot" : "cool"}`}>{company.overheat.toFixed(1)}</span></td>
                  <td><span className={`delta ${company.deltaOverheat > 0 ? "heating" : "cooling"}`}>{formatDelta(company.deltaOverheat)}</span></td>
                  <td><strong className="multiplier">{formatMultiplier(company.multiplier)}</strong></td>
                  <td><span className={`action-chip tone-${company.actionTone}`}>{company.action}</span></td>
                  <td><button className={registry.view === "active" ? "deactivate-button" : "reactivate-button"} onClick={(event) => { event.stopPropagation(); void changeCandidateState(company.symbol, registry.view !== "active"); }}>{registry.view === "active" ? "비활성화" : "재활성화"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleCompanies.length && <div className="candidate-empty"><strong>{registry.view === "active" ? "활성 후보가 없습니다." : "비활성 후보가 없습니다."}</strong><span>{registry.view === "active" ? "Fundamental Flow에서 Add to Buy Engine을 눌러 후보를 등록하세요." : "비활성화한 종목이 이곳에 표시됩니다."}</span></div>}
        </div>
        <div className="table-foot"><span>{visibleCompanies.length} symbols</span><span>{candidateMessage || "Deactivate는 이력을 삭제하지 않습니다."}</span></div>
      </section>

      {selected && <article className="detail-card" aria-live="polite">
        <div className="detail-header">
          <div className="identity"><div className={`ticker ticker-${selected.symbol.toLowerCase()}`}>{selected.symbol[0]}</div><div><div className="symbol-line"><h2>{selected.symbol}</h2><span>{selected.name}</span></div><p className="price">{formatPrice(selected.price)} · as of 2026.08.11</p></div></div>
          <div className={`gate-block stage-block-${selected.fundamentalStage}`}><span>FUNDAMENTAL STAGE</span><strong>{stageLabels[selected.fundamentalStage]}</strong><small>Score {selected.fundamentalScore?.toFixed(1) ?? "—"} · Trend adjustment</small></div>
          <div className={`decision-block tone-${selected.actionTone}`}><span>ACTION</span><strong>{selected.action}</strong><small>DCA {formatMultiplier(selected.multiplier)}</small></div>
        </div>

        <div className="priority-strip">
          <div className="priority-main"><span>DCA Multiplier</span><strong>{formatMultiplier(selected.multiplier)}</strong></div>
          <div><span>Value Score</span><strong>{selected.value.toFixed(1)}</strong></div>
          <div><span>Overheat Score</span><strong>{selected.overheat.toFixed(1)}</strong></div>
          <div><span>ΔOverheat</span><strong className={selected.deltaOverheat > 0 ? "text-caution" : "text-positive"}>{formatDelta(selected.deltaOverheat)}</strong></div>
          <div><span>Action</span><strong className={`text-${selected.actionTone}`}>{selected.action}</strong></div>
        </div>

        <p className="decision-summary">{selected.summary}</p>

        <div className="analysis-grid">
          <MetricPanel title="Value" subtitle={selected.valueState} metrics={selected.valueMetrics} score={selected.value} tone={selected.value >= 60 ? "positive" : selected.value < 20 ? "negative" : "neutral"} />
          <MetricPanel title="Overheat" subtitle={selected.overheatState} metrics={selected.overheatMetrics} score={selected.overheat} tone={selected.overheat >= 75 ? "negative" : selected.overheat >= 50 ? "caution" : "positive"} />
        </div>
      </article>}

      <section className="method-note"><div className="method-index">01</div><div><h3>Fundamental Trend는 DCA를 한 단계 보정합니다.</h3><p>Value + Overheat 기본 DCA에 성장 둔화·가이던스 하향은 감산하고, 개선 추세는 가산합니다. 최종 범위는 0~1.5×입니다.</p></div><div className="legend"><span><i className="legend-dot green" />BUY</span><span><i className="legend-dot amber" />PAUSE</span><span><i className="legend-dot red" />과열·부담</span></div></section>
      <footer><span>0×는 매도가 아닌 신규 매수 중단(PAUSE)입니다.</span><span>SELL 기능 없음 · 임계값 백테스트 전</span></footer>
    </main>
  );
}

