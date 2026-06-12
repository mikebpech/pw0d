import { totpDisableRequestSchema } from "@pw0d/api-client";
import { eq } from "drizzle-orm";
import { db, tables } from "@/server/db";
import { apiError, isResponse, json, parseBody, requireAuth } from "@/server/http";
import { verifyTotp } from "@/server/totp";

/** Turn 2FA off — requires a current code, so a stolen session can't disable it. */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (isResponse(auth)) return auth;
  const body = await parseBody(request, totpDisableRequestSchema);
  if (isResponse(body)) return body;

  const user = db
    .select({ totpSecret: tables.users.totpSecret, totpEnabled: tables.users.totpEnabled })
    .from(tables.users)
    .where(eq(tables.users.id, auth.userId))
    .get();
  if (!user?.totpEnabled || !user.totpSecret) {
    return apiError(400, "not_enabled", "2FA is not enabled");
  }
  if (!(await verifyTotp(user.totpSecret, body.code))) {
    return apiError(400, "totp_invalid", "incorrect authenticator code");
  }

  db.update(tables.users)
    .set({ totpSecret: null, totpEnabled: false })
    .where(eq(tables.users.id, auth.userId))
    .run();
  return json({ ok: true });
}
