import { env } from "cloudflare:workers";
import { normalizeTicker } from "@/lib/candidate-contract";
import { refreshCandidateAnalysis } from "@/lib/buy-analysis-service";

export const dynamic = "force-dynamic";
type RuntimeEnv = { DB?: D1Database; FMP_API_KEY?: string };
const runtime = env as unknown as RuntimeEnv;

export async function POST(request: Request) {
  if (!runtime.DB) return Response.json({ status: "database_unavailable" }, { status: 503 });
  if (!runtime.FMP_API_KEY) return Response.json({ status: "integration_not_configured", error: "FMP API key is not configured" }, { status: 503 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const analysis = await refreshCandidateAnalysis({ DB: runtime.DB, FMP_API_KEY: runtime.FMP_API_KEY }, normalizeTicker(body.ticker));
    return Response.json({ status: "updated", analysis });
  } catch (error) {
    return Response.json({ status: "analysis_failed", error: error instanceof Error ? error.message : "Analysis failed" }, { status: 422 });
  }
}

