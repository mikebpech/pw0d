import { recoverVerifyRequestSchema } from "@pw0d/api-client";
import { eq } from "drizzle-orm";
import { clientKey, isLoopback, rateLimit, verifyServerSecret } from "@/server/auth";
import { db, tables } from "@/server/db";
import { apiError, isResponse, json, parseBody } from "@/server/http";

/**
 * Step 1 of recovery (unauthenticated): the client proves it knows the recovery
 * code by sending the auth-key; on match we return the wrapped Account Key blob.
 * The blob is ciphertext that only the recovery code's enc-key (never sent) can
 * open — so handing it back reveals nothing.
 */
export async function POST(request: Request) {
  if (!isLoopback(request) && !rateLimit(`recover:${clientKey(request)}`, 10, 60_000)) {
    return apiError(429, "rate_limited", "too many attempts, slow down");
  }
  const body = await parseBody(request, recoverVerifyRequestSchema);
  if (isResponse(body)) return body;

  const user = db
    .select({
      blob: tables.users.recoveryKeyBlob,
      authHash: tables.users.recoveryAuthHash,
    })
    .from(tables.users)
    .where(eq(tables.users.email, body.email.trim().toLowerCase()))
    .get();

  // Same error for "no such account", "no recovery set up", and "wrong code".
  if (
    !user?.blob ||
    !user.authHash ||
    !(await verifyServerSecret(body.recoveryAuth, user.authHash))
  ) {
    return apiError(401, "invalid_recovery", "recovery code is incorrect");
  }

  return json({ recoveryKeyBlob: user.blob });
}
