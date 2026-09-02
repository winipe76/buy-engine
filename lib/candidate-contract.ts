export const FUNDAMENTAL_STAGES = ["newly_selected", "continuing_improvement", "watch", "caution", "excluded"] as const;
export type FundamentalStage = typeof FUNDAMENTAL_STAGES[number];

export type CandidateSnapshot = {
  ticker: string;
  company_name: string;
  fundamental_stage: FundamentalStage;
  fundamental_score: number | null;
  metrics: Record<string, unknown>;
  source_snapshot_date: string;
};

export function normalizeTicker(value: unknown) {
  if (typeof value !== "string") throw new Error("ticker is required");
  const ticker = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) throw new Error("ticker is invalid");
  return ticker;
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

export function parseCandidateSnapshot(value: unknown): CandidateSnapshot {
  if (!value || typeof value !== "object") throw new Error("candidate snapshot is required");
  const row = value as Record<string, unknown>;
  const stage = requiredText(row.fundamental_stage, "fundamental_stage") as FundamentalStage;
  if (!FUNDAMENTAL_STAGES.includes(stage)) throw new Error("fundamental_stage is invalid");
  if (!row.metrics || typeof row.metrics !== "object" || Array.isArray(row.metrics)) throw new Error("metrics is invalid");
  const fundamentalScore = typeof row.fundamental_score === "number" && Number.isFinite(row.fundamental_score) ? row.fundamental_score : null;
  return {
    ticker: normalizeTicker(row.ticker),
    company_name: requiredText(row.company_name, "company_name"),
    fundamental_stage: stage,
    fundamental_score: fundamentalScore,
    metrics: row.metrics as Record<string, unknown>,
    source_snapshot_date: requiredText(row.source_snapshot_date, "source_snapshot_date"),
  };
}

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

