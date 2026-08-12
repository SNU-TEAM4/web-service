import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lon = Number(request.nextUrl.searchParams.get("lon"));
  const radius = Math.min(10000, Math.max(1000, Number(request.nextUrl.searchParams.get("radius") || 3000)));
  const brands = Array.from(new Set((request.nextUrl.searchParams.get("brands") || "").split(",").map((brand) => brand.trim()).filter(Boolean)));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !brands.length) return NextResponse.json([]);
  if (brands.length > 30) {
    return NextResponse.json({ error: "한 번에 검색할 수 있는 브랜드는 최대 30개입니다." }, { status: 400 });
  }
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return NextResponse.json({ error: "카카오 REST API 키가 설정되지 않았습니다. Vercel 환경변수를 확인해 주세요." }, { status: 503 });

  const rows: Array<Record<string, unknown>> = [];
  const upstreamErrors: Array<{ brand: string; status: number }> = [];
  for (const brand of brands) {
    const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    Object.entries({ query: brand, x: String(lon), y: String(lat), radius: String(radius), sort: "distance", size: "15" })
      .forEach(([name, value]) => url.searchParams.set(name, value));
    const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, cache: "no-store" });
    if (!response.ok) { upstreamErrors.push({ brand, status: response.status }); continue; }
    const payload = await response.json();
    for (const item of payload.documents ?? []) {
      rows.push({
        id: item.id, name: item.place_name || brand, brand,
        address: item.road_address_name || item.address_name || "",
        lat: Number(item.y), lon: Number(item.x), distance: Number(item.distance || 0) / 1000,
        phone: item.phone || "", placeUrl: item.place_url || ""
      });
    }
  }
  if (!rows.length && upstreamErrors.length === brands.length) {
    return NextResponse.json(
      { error: `카카오 매장 검색이 응답하지 않았습니다. 키·쿼터·서비스 상태를 확인해 주세요. (${upstreamErrors[0]?.status})` },
      { status: 502 },
    );
  }
  const unique = Array.from(new Map(rows.map((row) => [String(row.id), row])).values())
    .sort((a, b) => Number(a.distance) - Number(b.distance));
  return NextResponse.json(unique);
}
