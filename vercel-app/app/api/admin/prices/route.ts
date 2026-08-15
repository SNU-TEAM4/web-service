import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, isValidAdminSession } from "@/lib/admin-auth";
import {
  PriceRow,
  PriceStoreConfigurationError,
  PriceStoreRequestError,
  priceStoreRequest,
  toPublicPrice,
} from "@/lib/price-store";

type PriceInput = {
  id?: unknown;
  brand?: unknown;
  menu?: unknown;
  channel?: unknown;
  storeName?: unknown;
  price?: unknown;
  checkedAt?: unknown;
  sourceUrl?: unknown;
  memo?: unknown;
};

function unauthorized() {
  return NextResponse.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 });
}

function hasAdminSession(request: NextRequest) {
  return isValidAdminSession(request.cookies.get(ADMIN_COOKIE_NAME)?.value);
}

function cleanText(value: unknown, maxLength: number, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : fallback;
}

function normalize(input: PriceInput) {
  const brand = cleanText(input.brand, 80);
  const menu = cleanText(input.menu, 160);
  const channel = cleanText(input.channel, 30, "매장") || "매장";
  const storeName = cleanText(input.storeName, 120, "전국 공통") || "전국 공통";
  const price = Number(input.price);
  const checkedAt = cleanText(input.checkedAt, 10);
  const sourceUrl = cleanText(input.sourceUrl, 500);
  const memo = cleanText(input.memo, 500);

  if (!brand || !menu) throw new Error("브랜드와 메뉴를 선택해 주세요.");
  if (!Number.isInteger(price) || price <= 0 || price > 1_000_000) {
    throw new Error("가격은 1원 이상 100만원 이하의 정수로 입력해 주세요.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedAt) || Number.isNaN(Date.parse(`${checkedAt}T00:00:00Z`))) {
    throw new Error("가격 확인일을 올바르게 입력해 주세요.");
  }
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
    throw new Error("출처 주소는 http:// 또는 https://로 시작해야 합니다.");
  }

  return {
    brand,
    menu,
    channel,
    store_name: storeName,
    price,
    checked_at: checkedAt,
    source_url: sourceUrl || null,
    memo: memo || null,
    updated_at: new Date().toISOString(),
  };
}

function databaseError(error: unknown) {
  if (error instanceof PriceStoreConfigurationError) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  if (error instanceof PriceStoreRequestError) {
    console.error("Supabase price request failed", error.status, error.message);
    return NextResponse.json({ error: "가격 데이터 저장소 요청에 실패했습니다." }, { status: 502 });
  }
  console.error("Unexpected price API error", error);
  return NextResponse.json({ error: "가격 데이터를 처리하지 못했습니다." }, { status: 500 });
}

export async function GET(request: NextRequest) {
  if (!hasAdminSession(request)) return unauthorized();
  try {
    const rows = await priceStoreRequest<PriceRow[]>("menu_prices?select=*&order=checked_at.desc,updated_at.desc&limit=5000");
    return NextResponse.json(rows.map(toPublicPrice));
  } catch (error) {
    return databaseError(error);
  }
}

export async function POST(request: NextRequest) {
  if (!hasAdminSession(request)) return unauthorized();
  const body = await request.json().catch(() => null) as PriceInput | { items?: PriceInput[] } | null;
  const batchItems = body && "items" in body ? body.items : undefined;
  const inputs: PriceInput[] | null = Array.isArray(batchItems) ? batchItems : body ? [body as PriceInput] : null;
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 1000) {
    return NextResponse.json({ error: "한 번에 1~1,000개의 가격을 등록할 수 있습니다." }, { status: 400 });
  }

  try {
    const records = inputs.map(normalize);
    const rows = await priceStoreRequest<PriceRow[]>(
      "menu_prices?on_conflict=brand,menu,channel,store_name&select=*",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(records),
      },
    );
    return NextResponse.json(rows.map(toPublicPrice));
  } catch (error) {
    if (error instanceof Error && !(error instanceof PriceStoreConfigurationError) && !(error instanceof PriceStoreRequestError)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return databaseError(error);
  }
}

export async function PATCH(request: NextRequest) {
  if (!hasAdminSession(request)) return unauthorized();
  const body = await request.json().catch(() => null) as PriceInput | null;
  const id = cleanText(body?.id, 64);
  if (!id) return NextResponse.json({ error: "수정할 데이터 ID가 없습니다." }, { status: 400 });

  try {
    const record = normalize(body || {});
    const rows = await priceStoreRequest<PriceRow[]>(`menu_prices?id=eq.${encodeURIComponent(id)}&select=*`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(record),
    });
    if (!rows.length) return NextResponse.json({ error: "수정할 가격을 찾지 못했습니다." }, { status: 404 });
    return NextResponse.json(toPublicPrice(rows[0]));
  } catch (error) {
    if (error instanceof Error && !(error instanceof PriceStoreConfigurationError) && !(error instanceof PriceStoreRequestError)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return databaseError(error);
  }
}

export async function DELETE(request: NextRequest) {
  if (!hasAdminSession(request)) return unauthorized();
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "삭제할 데이터 ID가 없습니다." }, { status: 400 });

  try {
    await priceStoreRequest<void>(`menu_prices?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return databaseError(error);
  }
}

