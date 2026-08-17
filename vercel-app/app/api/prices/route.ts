import { NextResponse } from "next/server";
import {
  PriceStoreConfigurationError,
  PriceStoreRequestError,
  loadAllPriceRows,
  toPublicPrice,
} from "@/lib/price-store";

export async function GET() {
  try {
    const rows = await loadAllPriceRows();
    return NextResponse.json(rows.map((row) => ({ ...toPublicPrice(row), memo: "" })), {
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
