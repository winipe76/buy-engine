import { searchKrxEtfs } from "@/lib/pension-etf";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) return Response.json({ etfs: [] });
  try {
    return Response.json({ etfs: await searchKrxEtfs(query) }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ETF 검색 실패" }, { status: 502 });
  }
}
