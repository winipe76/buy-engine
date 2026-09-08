import { env } from "cloudflare:workers";
import { loadEtfValuation, searchKrxEtfs } from "@/lib/pension-etf";

export const dynamic = "force-dynamic";
type RuntimeEnv = { DB?: D1Database };
const runtime = env as unknown as RuntimeEnv;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  if (!runtime.DB) return json({ error: "Pension DB 연결이 필요합니다.", candidates: [] }, 503);
  const result = await runtime.DB.prepare("SELECT * FROM pension_etf_candidates ORDER BY added_at DESC, ticker").all();
  return json({ candidates: result.results });
}

export async function POST(request: Request) {
  if (!runtime.DB) return json({ error: "Pension DB 연결이 필요합니다." }, 503);
  try {
    const body = await request.json() as { ticker?: unknown };
    const ticker = typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
    if (!/^[0-9A-Z]{6}$/.test(ticker)) return json({ error: "유효한 국내 ETF 종목코드가 아닙니다." }, 400);
    const etf = (await searchKrxEtfs(ticker)).find((item) => item.ticker === ticker);
    if (!etf) return json({ error: "현재 KRX 상장 ETF에서 찾지 못했습니다." }, 404);
    const valuation = await loadEtfValuation(etf);
    const now = new Date().toISOString();
    await runtime.DB.prepare(`INSERT INTO pension_etf_candidates
      (ticker,isin,name,category,valuation_profile,valuation_json,valuation_as_of,added_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(ticker) DO UPDATE SET isin=excluded.isin,name=excluded.name,category=excluded.category,
      valuation_profile=excluded.valuation_profile,valuation_json=excluded.valuation_json,
      valuation_as_of=excluded.valuation_as_of,updated_at=excluded.updated_at`)
      .bind(etf.ticker, etf.isin, etf.name, etf.category, etf.profile, JSON.stringify(valuation), valuation.as_of ?? null, now, now).run();
    return json({ status: "saved", candidate: { ...etf, valuation } });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "ETF 후보 저장 실패" }, 400);
  }
}

export async function DELETE(request: Request) {
  if (!runtime.DB) return json({ error: "Pension DB 연결이 필요합니다." }, 503);
  const ticker = new URL(request.url).searchParams.get("ticker")?.trim().toUpperCase() ?? "";
  if (!/^[0-9A-Z]{6}$/.test(ticker)) return json({ error: "유효한 국내 ETF 종목코드가 아닙니다." }, 400);
  await runtime.DB.prepare("DELETE FROM pension_etf_candidates WHERE ticker = ?").bind(ticker).run();
  return json({ status: "removed", ticker });
}
