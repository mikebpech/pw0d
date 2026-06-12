import { totpEnableRequestSchema } from "@pw0d/api-client";
import { eq } from "drizzle-orm";
import { db, tables } from "@/server/db";
import { apiError, isResponse, json, parseBody, requireAuth } from "@/server/http";
import { verifyTotp } from "@/server/totp";

/** Confirm enrollment: a valid code proves the authenticator is set up. */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (isResponse(auth)) return auth;
  const body = await parseBody(request, totpEnableRequestSchema);
  if (isResponse(body)) return body;

  const user = db
    .select({ totpSecret: tables.users.totpSecret, totpEnabled: tables.users.totpEnabled })
    .from(tables.users)
    .where(eq(tables.users.id, auth.userId))
    .get();
  if (!user?.totpSecret) return apiError(400, "no_pending_setup", "start 2FA setup first");
  if (user.totpEnabled) return apiError(409, "already_enabled", "2FA is already enabled");
  if (!(await verifyTotp(user.totpSecret, body.code))) {
    return apiError(400, "totp_invalid", "code didn't match — check your authenticator");
  }

  db.update(tables.users)
    .set({ totpEnabled: true })
    .where(eq(tables.users.id, auth.userId))
    .run();
  return json({ ok: true });
}
