import { env } from "cloudflare:workers";
import { bearerToken, normalizeTicker, parseCandidateSnapshot } from "@/lib/candidate-contract";
import { setCandidateActive, syncCandidate } from "@/lib/candidate-store";

export const dynamic = "force-dynamic";
type RuntimeEnv = { DB?: D1Database; BUY_ENGINE_SYNC_TOKEN?: string };
const runtime = env as unknown as RuntimeEnv;

function authorized(request: Request) {
  return Boolean(runtime.BUY_ENGINE_SYNC_TOKEN) && bearerToken(request) === runtime.BUY_ENGINE_SYNC_TOKEN;
}

export async function GET(request: Request) {
  if (!runtime.DB) return Response.json({ status: "database_unavailable" }, { status: 503 });
  if (!authorized(request)) return Response.json({ status: "unauthorized", error: "Invalid sync token" }, { status: 401 });
  try {
    const ticker = normalizeTicker(new URL(request.url).searchParams.get("ticker"));
    const candidate = await runtime.DB.prepare("SELECT ticker,active FROM buy_candidates WHERE ticker=? LIMIT 1").bind(ticker).first<{ ticker: string; active: number }>();
    return Response.json({ status: "connected", ticker, added: candidate?.active === 1 });
  } catch (error) {
    return Response.json({ status: "invalid_request", error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  if (!runtime.DB) return Response.json({ status: "database_unavailable" }, { status: 503 });
  if (!authorized(request)) {
    return Response.json({ status: "unauthorized", error: "Invalid sync token" }, { status: 401 });
  }
  try {
    const snapshot = parseCandidateSnapshot(await request.json());
    const result = await syncCandidate(runtime.DB, snapshot);
    return Response.json({ ...result, candidate: { ticker: snapshot.ticker, active: true } }, { status: result.status === "added" ? 201 : 200 });
  } catch (error) {
    return Response.json({ status: "invalid_request", error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!runtime.DB) return Response.json({ status: "database_unavailable" }, { status: 503 });
  if (!authorized(request)) {
    return Response.json({ status: "unauthorized", error: "Invalid sync token" }, { status: 401 });
  }
  try {
    const body = await request.json() as Record<string, unknown>;
    const ticker = normalizeTicker(body.ticker);
    const candidate = await setCandidateActive(runtime.DB, ticker, false);
    if (!candidate) return Response.json({ status: "not_found", error: "Candidate was not found" }, { status: 404 });
    return Response.json({ status: "removed", candidate });
  } catch (error) {
    return Response.json({ status: "invalid_request", error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  }
}

