import { eq } from "drizzle-orm";
import { db, tables } from "@/server/db";
import { apiError, isResponse, json, requireAuth } from "@/server/http";
import { generateTotpSecret, otpauthUri } from "@/server/totp";

/**
 * Begin 2FA enrollment: generate a fresh secret, store it as PENDING (not yet
 * enabled), and return it + the otpauth URI for the QR/manual entry. The user
 * must confirm with a valid code via /enable before it gates login.
 */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (isResponse(auth)) return auth;

  const user = db
    .select({ email: tables.users.email, totpEnabled: tables.users.totpEnabled })
    .from(tables.users)
    .where(eq(tables.users.id, auth.userId))
    .get();
  if (!user) return apiError(404, "not_found", "account not found");
  if (user.totpEnabled) return apiError(409, "already_enabled", "2FA is already enabled");

  const secret = generateTotpSecret();
  db.update(tables.users)
    .set({ totpSecret: secret, totpEnabled: false })
    .where(eq(tables.users.id, auth.userId))
    .run();

  return json({ secret, otpauthUri: otpauthUri(secret, user.email) });
}
