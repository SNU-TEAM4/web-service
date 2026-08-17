import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return NextResponse.json({ error: "Kakao REST API key is missing" }, { status: 503 });
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lon = Number(request.nextUrl.searchParams.get("lon"));
  const radius = Math.min(10000, Math.max(1000, Number(request.nextUrl.searchParams.get("radius") || 3000)));
  const brands = Array.from(new Set(
    (request.nextUrl.searchParams.get("brands") || "").split(",").map((brand) => brand.trim()).filter(Boolean)
  )).slice(0, 50);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !brands.length) return NextResponse.json([]);

  const searchBrand = async (brand: string) => {
    const found: Array<Record<string, unknown>> = [];
    for (let page = 1; page <= 3; page += 1) {
      const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
      Object.entries({ query: brand, x: String(lon), y: String(lat), radius: String(radius), sort: "distance", size: "15", page: String(page) })
        .forEach(([name, value]) => url.searchParams.set(name, value));
      const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, cache: "no-store" });
      if (!response.ok) break;
      const payload = await response.json();
      for (const item of payload.documents ?? []) {
        found.push({
          id: item.id, name: item.place_name || brand, brand,
          address: item.road_address_name || item.address_name || "",
          lat: Number(item.y), lon: Number(item.x), distance: Number(item.distance || 0) / 1000,
          phone: item.phone || "", placeUrl: item.place_url || ""
        });
      }
      if (payload.meta?.is_end) break;
    }
    return found;
  };
  // 카카오 로컬 API에 37개 브랜드를 한꺼번에 몰아 보내지 않도록 작은 묶음으로 조회한다.
  const brandRows: Array<Array<Record<string, unknown>>> = [];
  for (let index = 0; index < brands.length; index += 6) {
    brandRows.push(...await Promise.all(brands.slice(index, index + 6).map(searchBrand)));
  }
  const rows = brandRows.flat();
  const unique = Array.from(new Map(rows.map((row) => [String(row.id), row])).values())
    .sort((a, b) => Number(a.distance) - Number(b.distance));
  return NextResponse.json(unique);
}
