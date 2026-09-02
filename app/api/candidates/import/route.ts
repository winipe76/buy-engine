import { env } from "cloudflare:workers";
import { setCandidateActive, syncCandidate } from "@/lib/candidate-store";
import { readCandidateTransferToken } from "@/lib/candidate-transfer-token";
import { refreshCandidateAnalysis } from "@/lib/buy-analysis-service";

export const dynamic = "force-dynamic";
type RuntimeEnv = { DB?: D1Database; BUY_ENGINE_SYNC_TOKEN?: string; FMP_API_KEY?: string };
const runtime = env as unknown as RuntimeEnv;

function dashboardRedirect(request: Request, params: Record<string, string>) {
  const target = new URL("/", request.url);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  return Response.redirect(target, 303);
}

function fundamentalRedirect(returnUrl: string, ticker: string, added: boolean) {
  const target = new URL(returnUrl);
  target.searchParams.set("buy_engine_ticker", ticker);
  target.searchParams.set("buy_engine_added", String(added));
  return Response.redirect(target, 303);
}

export async function GET(request: Request) {
  if (!runtime.DB || !runtime.BUY_ENGINE_SYNC_TOKEN) {
    return dashboardRedirect(request, { candidate_status: "error", candidate_message: "Buy Engine 후보 저장소 설정을 확인해 주세요." });
  }
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const transfer = await readCandidateTransferToken(token, runtime.BUY_ENGINE_SYNC_TOKEN);
    const { snapshot } = transfer;
    if (transfer.action === "remove") {
      await setCandidateActive(runtime.DB, snapshot.ticker, false);
      return fundamentalRedirect(transfer.returnUrl, snapshot.ticker, false);
    }
    await syncCandidate(runtime.DB, snapshot);
    if (!runtime.FMP_API_KEY) return fundamentalRedirect(transfer.returnUrl, snapshot.ticker, true);
    try {
      await refreshCandidateAnalysis({ DB: runtime.DB, FMP_API_KEY: runtime.FMP_API_KEY }, snapshot.ticker);
      return fundamentalRedirect(transfer.returnUrl, snapshot.ticker, true);
    } catch {
      return fundamentalRedirect(transfer.returnUrl, snapshot.ticker, true);
    }
  } catch (error) {
    const message = error instanceof Error && error.message.includes("expired")
      ? "후보 전송 시간이 만료되었습니다. Fundamental Flow에서 다시 추가해 주세요."
      : "후보 정보를 확인할 수 없습니다. Fundamental Flow에서 다시 시도해 주세요.";
    return dashboardRedirect(request, { candidate_status: "error", candidate_message: message });
  }
}

