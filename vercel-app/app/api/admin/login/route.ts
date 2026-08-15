import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE,
  adminAuthConfigurationError,
  createAdminSession,
  isValidAdminPassword,
} from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const configurationError = adminAuthConfigurationError();
  if (configurationError) {
    return NextResponse.json({ error: configurationError }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!isValidAdminPassword(password)) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: createAdminSession(),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  });
  return response;
}

