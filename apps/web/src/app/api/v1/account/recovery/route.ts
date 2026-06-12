import { recoverySetupRequestSchema } from "@pw0d/api-client";
import { eq } from "drizzle-orm";
import { hashServerSecret } from "@/server/auth";
import { db, tables } from "@/server/db";
import { apiError, isResponse, json, parseBody, requireAuth } from "@/server/http";

/** Whether recovery is configured. */
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (isResponse(auth)) return auth;
  const user = db
    .select({ blob: tables.users.recoveryKeyBlob })
    .from(tables.users)
    .where(eq(tables.users.id, auth.userId))
    .get();
  return json({ enabled: !!user?.blob });
}

/**
 * Store/replace the recovery blob + auth hash. Called while UNLOCKED — the
 * client wrapped the Account Key with the recovery code's enc-key and sends
 * only the wrapped blob + the auth-key (which the server hashes). The server
 * never sees the recovery code or the enc-key, so it can't decrypt the blob.
 */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (isResponse(auth)) return auth;
  const body = await parseBody(request, recoverySetupRequestSchema);
  if (isResponse(body)) return body;

  db.update(tables.users)
    .set({
      recoveryKeyBlob: body.recoveryKeyBlob,
      recoveryAuthHash: await hashServerSecret(body.recoveryAuth),
    })
    .where(eq(tables.users.id, auth.userId))
    .run();
  return json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth(request);
  if (isResponse(auth)) return auth;
  db.update(tables.users)
    .set({ recoveryKeyBlob: null, recoveryAuthHash: null })
    .where(eq(tables.users.id, auth.userId))
    .run();
  return json({ ok: true });
}
