export type PriceRow = {
  id: string;
  brand: string;
  menu: string;
  channel: string;
  store_name: string;
  price: number;
  checked_at: string;
  source_url: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

export class PriceStoreConfigurationError extends Error {}

export class PriceStoreRequestError extends Error {
  constructor(public status: number, message: string, public code = "") {
    super(message);
  }
}

function configuration() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  const apiKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !apiKey) {
    throw new PriceStoreConfigurationError("Supabase 연결 정보가 설정되지 않았습니다.");
  }
  return { url, apiKey };
}

export async function priceStoreRequest<T>(path: string, init: RequestInit = {}) {
  const { url, apiKey } = configuration();
  const headers = new Headers(init.headers);
  headers.set("apikey", apiKey);
  headers.set("Content-Type", "application/json");
  if (!apiKey.startsWith("sb_secret_")) headers.set("Authorization", `Bearer ${apiKey}`);
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers,
  });

  if (!response.ok) {
    const detail = await response.text();
    let code = "";
    try {
      const parsed = JSON.parse(detail) as { code?: unknown };
      if (typeof parsed.code === "string" && /^[A-Z0-9_]+$/.test(parsed.code)) code = parsed.code;
    } catch {}
    throw new PriceStoreRequestError(response.status, detail || "가격 데이터 요청에 실패했습니다.", code);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function toPublicPrice(row: PriceRow) {
  return {
    id: row.id,
    brand: row.brand,
    menu: row.menu,
    channel: row.channel,
    storeName: row.store_name,
    price: row.price,
    checkedAt: row.checked_at,
    sourceUrl: row.source_url || "",
    memo: row.memo || "",
    updatedAt: row.updated_at,
  };
}

