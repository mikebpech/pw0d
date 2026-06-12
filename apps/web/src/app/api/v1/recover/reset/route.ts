import { recoverResetRequestSchema } from "@pw0d/api-client";
import { eq } from "drizzle-orm";
import { clientKey, hashServerSecret, isLoopback, rateLimit, verifyServerSecret } from "@/server/auth";
import { db, tables } from "@/server/db";
import { apiError, isResponse, json, parseBody } from "@/server/http";

/**
 * Step 2 of recovery (unauthenticated): re-verify the recovery auth-key, then
 * apply the new master-password material the client derived locally (after
 * unwrapping the Account Key with the recovery code). Drops all sessions.
 * The recovery blob is unchanged — the same code still works afterward.
 */
export async function POST(request: Request) {
  if (!isLoopback(request) && !rateLimit(`recover:${clientKey(request)}`, 10, 60_000)) {
    return apiError(429, "rate_limited", "too many attempts, slow down");
  }
  const body = await parseBody(request, recoverResetRequestSchema);
  if (isResponse(body)) return body;

  const user = db
    .select()
    .from(tables.users)
    .where(eq(tables.users.email, body.email.trim().toLowerCase()))
    .get();
  if (
    !user?.recoveryKeyBlob ||
    !user.recoveryAuthHash ||
    !(await verifyServerSecret(body.recoveryAuth, user.recoveryAuthHash))
  ) {
    return apiError(401, "invalid_recovery", "recovery code is incorrect");
  }

  db.update(tables.users)
    .set({
      loginHash: await hashServerSecret(body.newLoginHash),
      kdfParams: JSON.stringify(body.kdfParams),
      protectedAccountKey: body.protectedAccountKey,
    })
    .where(eq(tables.users.id, user.id))
    .run();

  // A password reset evicts every existing session.
  db.delete(tables.devices).where(eq(tables.devices.userId, user.id)).run();

  return json({ ok: true });
}
