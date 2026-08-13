import { NextResponse } from "next/server";
import {
  PriceRow,
  PriceStoreConfigurationError,
  PriceStoreRequestError,
  priceStoreRequest,
  toPublicPrice,
} from "@/lib/price-store";

export async function GET() {
  try {
    const rows = await priceStoreRequest<PriceRow[]>(
      "menu_prices?select=*&order=checked_at.desc,updated_at.desc&limit=5000",
    );
    return NextResponse.json(rows.map(toPublicPrice), {
      headers: { "Cache-Control": "no-store", "X-Hanip-Price-Store": "connected" },
    });
  } catch (error) {
    if (!(error instanceof PriceStoreConfigurationError)) console.error("Public price request failed", error);
    return NextResponse.json([], {
      headers: {
        "Cache-Control": "no-store",
        "X-Hanip-Price-Store": error instanceof PriceStoreConfigurationError
          ? "not-configured"
          : error instanceof PriceStoreRequestError
            ? `request-${error.status}${error.code ? `-${error.code}` : ""}`
            : "error",
      },
    });
  }
}

