import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "hanip-ansim-web",
    environment: process.env.VERCEL_ENV || "local",
    menuData: "/data/menus.csv",
    kakaoRestConfigured: Boolean(process.env.KAKAO_REST_API_KEY),
    kakaoJavascriptConfigured: Boolean(process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY),
  });
}
