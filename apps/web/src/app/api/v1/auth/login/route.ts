import { loginRequestSchema } from "@pw0d/api-client";
import { eq } from "drizzle-orm";
import {
  clientKey,
  createDevice,
  isLoopback,
  issueAccessToken,
  rateLimit,
  verifyServerSecret,
} from "@/server/auth";
import { db, tables } from "@/server/db";
import { apiError, isResponse, json, parseBody } from "@/server/http";
import { verifyTotp } from "@/server/totp";

export async function POST(request: Request) {
  // 30/min per IP: stops brute force (each try costs a server-side Argon2id),
  // tolerant of shared NAT and mistyped passwords. Loopback (same box) exempt.
  if (!isLoopback(request) && !rateLimit(`login:${clientKey(request)}`, 30, 60_000)) {
    return apiError(429, "rate_limited", "too many attempts, slow down");
  }
  const body = await parseBody(request, loginRequestSchema);
  if (isResponse(body)) return body;

  const user = db
    .select()
    .from(tables.users)
    .where(eq(tables.users.email, body.email.trim().toLowerCase()))
    .get();
  // Same error for unknown email and wrong hash — no enumeration.
  if (!user || !(await verifyServerSecret(body.loginHash, user.loginHash))) {
    return apiError(401, "invalid_credentials", "invalid email or master password");
  }

  // Account 2FA gate (master password verified above; this guards token issuance).
  if (user.totpEnabled && user.totpSecret) {
    if (!body.totpCode) {
      return apiError(401, "totp_required", "enter your authenticator code");
    }
    if (!(await verifyTotp(user.totpSecret, body.totpCode))) {
      return apiError(401, "totp_invalid", "incorrect authenticator code");
    }
  }

  const { deviceId, refreshToken } = await createDevice(user.id, body.deviceName);
  return json({
    userId: user.id,
    accessToken: await issueAccessToken(user.id, deviceId),
    refreshToken,
    protectedAccountKey: user.protectedAccountKey,
    kdfParams: JSON.parse(user.kdfParams),
  });
}
