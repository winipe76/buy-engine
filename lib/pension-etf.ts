export type PensionProfile = "GOLD" | "NASDAQ" | "SP500" | "DIVIDEND" | "BOND" | "GENERAL";

export type EtfSearchResult = {
  ticker: string;
  isin: string;
  name: string;
  category: string;
  profile: PensionProfile;
};

export type ValuationMetric = { label: string; value: number; unit: "%"; note: string };
export type ValuationSnapshot = {
  status: "available" | "unavailable";
  price?: number;
  currency?: string;
  as_of?: string;
  metrics?: ValuationMetric[];
  source: string;
  note: string;
  error?: string;
};

const profileLabels: Record<PensionProfile, string> = {
  GOLD: "금", NASDAQ: "나스닥", SP500: "S&P 500", DIVIDEND: "배당", BOND: "채권", GENERAL: "기타",
};

export function classifyEtf(name: string): { profile: PensionProfile; category: string } {
  const upper = name.toUpperCase();
  let profile: PensionProfile = "GENERAL";
  if (/골드|금현물|금선물|금액티브/.test(name)) profile = "GOLD";
  else if (/NASDAQ|나스닥/.test(upper)) profile = "NASDAQ";
  else if (/S&P\s?500|에스앤피500/.test(upper)) profile = "SP500";
  else if (/배당|고배당|DIVIDEND/.test(upper)) profile = "DIVIDEND";
  else if (/채권|국고채|회사채|단기채|KOFR|CD금리/.test(upper)) profile = "BOND";
  // ponytail: KRX 공개 검색 응답에는 분류 필드가 없어 이름으로 분류한다. KRX Open API 키가 생기면 마스터 분류로 교체한다.
  return { profile, category: profileLabels[profile] };
}

export async function searchKrxEtfs(query: string): Promise<EtfSearchResult[]> {
  const searchText = query.trim();
  if (!searchText) return [];
  const codeSearch = /^[0-9A-Z]{6}$/i.test(searchText);
  const body = new URLSearchParams({ bld: "dbms/comm/finder/finder_dataetfisu", locale: "ko_KR", searchText: codeSearch ? "" : searchText, delListIn: "" });
  try {
    const response = await fetch("https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", Referer: "https://data.krx.co.kr/", "X-Requested-With": "XMLHttpRequest" },
      body,
    });
    if (!response.ok) throw new Error("KRX blocked");
    const payload = await response.json() as { block1?: Array<{ full_code?: string; short_code?: string; codeName?: string; dellistDd?: string }> };
    return (payload.block1 ?? []).filter((item) => item.short_code && item.codeName && !item.dellistDd && (!codeSearch || item.short_code.toUpperCase() === searchText.toUpperCase())).slice(0, 50).map((item) => ({
      ticker: item.short_code!, isin: item.full_code ?? "", name: item.codeName!, ...classifyEtf(item.codeName!),
    }));
  } catch {
    const response = await fetch("https://finance.naver.com/api/sise/etfItemList.nhn", { headers: { Referer: "https://finance.naver.com/", "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) throw new Error("국내 ETF 검색 데이터에 연결하지 못했습니다.");
    const text = new TextDecoder("euc-kr").decode(await response.arrayBuffer());
    const payload = JSON.parse(text) as { result?: { etfItemList?: Array<{ itemcode?: string; itemname?: string }> } };
    const terms = searchText.toUpperCase().split(/\s+/);
    return (payload.result?.etfItemList ?? []).filter((item) => item.itemcode && item.itemname && terms.every((term) => `${item.itemcode} ${item.itemname}`.toUpperCase().includes(term))).slice(0, 50).map((item) => ({
      ticker: item.itemcode!, isin: "", name: item.itemname!, ...classifyEtf(item.itemname!),
    }));
  }
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function calculateHistoricalValuation(profile: PensionProfile, closes: number[], annualDistributions: number | null = null): ValuationMetric[] {
  if (closes.length < 20) throw new Error("Valuation 계산에 필요한 가격 이력이 부족합니다.");
  const price = closes.at(-1)!;
  const historyMedian = median(closes);
  const percentile = closes.filter((value) => value <= price).length / closes.length * 100;
  const high = Math.max(...closes.slice(-252));
  const history = [
    { label: "2년 중앙값 대비", value: (price / historyMedian - 1) * 100, unit: "%" as const, note: "ETF 종가의 역사적 가격 수준" },
    { label: "2년 가격 백분위", value: percentile, unit: "%" as const, note: "낮을수록 과거 가격 범위의 하단" },
    { label: "1년 고점 대비", value: (price / high - 1) * 100, unit: "%" as const, note: "최근 252거래일 종가 고점 기준" },
  ];
  if (profile === "DIVIDEND" && annualDistributions !== null) history.unshift({ label: "최근 12개월 분배금 수익률", value: annualDistributions / price * 100, unit: "%", note: "지급 분배금 합계 / 현재가" });
  return history;
}

export function parseNaverPriceHistory(xml: string) {
  const rows = [...xml.matchAll(/<item data="([^"]+)"/g)].map((match) => match[1].split("|")).filter((row) => row.length >= 5 && Number.isFinite(Number(row[4])));
  if (rows.length < 20) throw new Error("Valuation 계산에 필요한 가격 이력이 부족합니다.");
  const date = rows.at(-1)![0];
  return { closes: rows.map((row) => Number(row[4])), asOf: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` };
}

export async function loadEtfValuation(etf: EtfSearchResult): Promise<ValuationSnapshot> {
  try {
    const response = await fetch(`https://fchart.stock.naver.com/sise.nhn?symbol=${etf.ticker}&timeframe=day&count=520&requestType=0`, { headers: { Referer: "https://finance.naver.com/", "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) throw new Error("가격 이력을 불러오지 못했습니다.");
    const { closes, asOf } = parseNaverPriceHistory(await response.text());
    const note = etf.profile === "GOLD" ? "금 ETF 자체의 역사적 가격 수준입니다. 실질금리·달러 지표는 아직 연결하지 않았습니다." : etf.profile === "NASDAQ" || etf.profile === "SP500" ? "ETF 자체의 역사적 가격 수준입니다. 지수 Forward P/E는 아직 연결하지 않았습니다." : etf.profile === "DIVIDEND" ? "ETF 가격 이력 기반 Valuation입니다. 분배금 수익률은 아직 연결하지 않았습니다." : "ETF 가격 이력 기반 Valuation입니다.";
    return { status: "available", price: closes.at(-1), currency: "KRW", as_of: asOf, metrics: calculateHistoricalValuation(etf.profile, closes), source: "Naver Finance", note };
  } catch (error) {
    return { status: "unavailable", source: "Naver Finance", note: "후보는 저장되었으며 Valuation 데이터만 확인이 필요합니다.", error: error instanceof Error ? error.message : "Valuation 계산 실패" };
  }
}
