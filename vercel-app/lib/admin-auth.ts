import { createHash, createHmac, timingSafeEqual } from "crypto";

export const ADMIN_COOKIE_NAME = "hanip_admin_session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 8;

type SessionPayload = {
  expiresAt: number;
  version: 1;
};

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function safeEqual(left: string, right: string) {
  return timingSafeEqual(digest(left), digest(right));
}

function signingSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function adminAuthConfigurationError() {
  if (!process.env.ADMIN_PASSWORD) return "ADMIN_PASSWORD가 설정되지 않았습니다.";
  if (!signingSecret()) return "ADMIN_SESSION_SECRET을 32자 이상으로 설정해 주세요.";
  return null;
}

export function isValidAdminPassword(password: string) {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  return Boolean(configuredPassword) && safeEqual(password, configuredPassword!);
}

export function createAdminSession() {
  const secret = signingSecret();
  if (!secret) throw new Error("Admin session secret is not configured");

  const payload: SessionPayload = {
    expiresAt: Date.now() + ADMIN_SESSION_MAX_AGE * 1000,
    version: 1,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signature(encodedPayload, secret)}`;
}

export function isValidAdminSession(token?: string | null) {
  const secret = signingSecret();
  if (!secret || !token) return false;

  const [encodedPayload, receivedSignature, ...rest] = token.split(".");
  if (!encodedPayload || !receivedSignature || rest.length) return false;
  if (!safeEqual(receivedSignature, signature(encodedPayload, secret))) return false;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
    return payload.version === 1 && Number.isFinite(payload.expiresAt) && payload.expiresAt > Date.now();
  } catch {
    return false;
  }
}

