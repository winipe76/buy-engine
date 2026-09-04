import { env } from "cloudflare:workers";
import { normalizeTicker } from "@/lib/candidate-contract";
import { setCandidateActive } from "@/lib/candidate-store";

export const dynamic = "force-dynamic";
type RuntimeEnv = { DB?: D1Database };
const runtime = env as unknown as RuntimeEnv;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  if (!runtime.DB) return json({ status: "database_unavailable", candidates: [] }, 503);
  const filter = new URL(request.url).searchParams.get("status") ?? "active";
  if (!['active', 'inactive', 'all'].includes(filter)) return json({ status: "invalid_request", error: "status must be active, inactive, or all" }, 400);
  const where = filter === "all" ? "" : `WHERE active=${filter === "active" ? 1 : 0}`;
  const result = await runtime.DB.prepare(`SELECT c.*,
    a.analyzed_at,a.price_as_of,a.price,a.value_score,a.overheat_score,a.delta_overheat,a.dca_multiplier,a.action,
    a.value_state,a.overheat_state,a.value_metrics_json,a.overheat_metrics_json,a.data_quality_json,a.source_version
    FROM buy_candidates c
    LEFT JOIN buy_analysis_snapshots a ON a.id=(SELECT latest.id FROM buy_analysis_snapshots latest WHERE latest.ticker=c.ticker ORDER BY latest.analyzed_at DESC LIMIT 1)
    ${where ? where.replace("active", "c.active") : ""}
    ORDER BY c.active DESC,c.last_synced_at DESC,c.ticker`).all();
  return json({ status: "connected", candidates: result.results });
}

export async function PATCH(request: Request) {
  if (!runtime.DB) return json({ status: "database_unavailable" }, 503);
  try {
    const body = await request.json() as Record<string, unknown>;
    const ticker = normalizeTicker(body.ticker);
    if (typeof body.active !== "boolean") throw new Error("active must be boolean");
    const candidate = await setCandidateActive(runtime.DB, ticker, body.active);
    if (!candidate) return json({ status: "not_found", error: "Candidate was not found" }, 404);
    return json({ status: body.active ? "reactivated" : "deactivated", candidate });
  } catch (error) {
    return json({ status: "invalid_request", error: error instanceof Error ? error.message : "Invalid request" }, 400);
  }
}

