import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json([]);
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return NextResponse.json({ error: "카카오 REST API 키가 설정되지 않았습니다. Vercel 환경변수를 확인해 주세요." }, { status: 503 });

  const results: Array<{ id: string; name: string; address: string; lat: number; lon: number }> = [];
  for (const endpoint of ["keyword", "address"]) {
    const url = new URL(`https://dapi.kakao.com/v2/local/search/${endpoint}.json`);
    url.searchParams.set("query", query);
    url.searchParams.set("size", "5");
    const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, cache: "no-store" });
    if (!response.ok) continue;
    const payload = await response.json();
    for (const item of payload.documents ?? []) {
      const lat = Number(item.y);
      const lon = Number(item.x);
      if (results.some((result) => Math.abs(result.lat - lat) < 1e-7 && Math.abs(result.lon - lon) < 1e-7)) continue;
      const address = item.road_address_name || item.road_address?.address_name || item.address_name || item.address?.address_name || "";
      results.push({ id: item.id || `${lon}-${lat}`, name: item.place_name || address || query, address, lat, lon });
    }
  }
  return NextResponse.json(results.slice(0, 5));
}
