import { changePasswordRequestSchema } from "@pw0d/api-client";
import { and, eq, ne } from "drizzle-orm";
import { hashServerSecret, verifyServerSecret } from "@/server/auth";
import { db, tables } from "@/server/db";
import { apiError, isResponse, json, parseBody, requireAuth } from "@/server/http";

/**
 * Master-password change. The client re-derives keys and re-wraps the Account
 * Key locally, then sends the new wrapped key + new login hash. The server only
 * swaps ciphertext — it never sees old or new master password, and no vault
 * item is re-encrypted (the Account Key is unchanged).
 */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (isResponse(auth)) return auth;
  const body = await parseBody(request, changePasswordRequestSchema);
  if (isResponse(body)) return body;

  const user = db.select().from(tables.users).where(eq(tables.users.id, auth.userId)).get();
  if (!user) return apiError(404, "not_found", "account not found");
  if (!(await verifyServerSecret(body.currentLoginHash, user.loginHash))) {
    return apiError(403, "wrong_password", "current master password is incorrect");
  }

  db.update(tables.users)
    .set({
      loginHash: await hashServerSecret(body.newLoginHash),
      kdfParams: JSON.stringify(body.kdfParams),
      protectedAccountKey: body.protectedAccountKey,
    })
    .where(eq(tables.users.id, auth.userId))
    .run();

  // Drop every OTHER session — a password change should evict devices that may
  // have cached the old wrapped key. The current device stays signed in.
  db.delete(tables.devices)
    .where(and(eq(tables.devices.userId, auth.userId), ne(tables.devices.id, auth.deviceId)))
    .run();

  return json({ ok: true });
}
