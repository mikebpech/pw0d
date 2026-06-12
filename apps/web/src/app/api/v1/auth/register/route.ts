import { registerRequestSchema } from "@pw0d/api-client";
import { eq } from "drizzle-orm";
import { clientKey, hashServerSecret, rateLimit } from "@/server/auth";
import { db, tables } from "@/server/db";
import { env } from "@/server/env";
import { apiError, isResponse, json, parseBody } from "@/server/http";

export async function POST(request: Request) {
  if (!rateLimit(`register:${clientKey(request)}`, 10, 60_000)) {
    return apiError(429, "rate_limited", "too many attempts, slow down");
  }
  const body = await parseBody(request, registerRequestSchema);
  if (isResponse(body)) return body;

  const userCount = db.$count(tables.users);
  if (!env.signupsAllowed && (await userCount) > 0) {
    return apiError(403, "signups_disabled", "signups are disabled on this server");
  }

  const email = body.email.trim().toLowerCase();
  const existing = db
    .select({ id: tables.users.id })
    .from(tables.users)
    .where(eq(tables.users.email, email))
    .get();
  if (existing) return apiError(409, "email_taken", "an account with this email already exists");

  db.insert(tables.users)
    .values({
      id: crypto.randomUUID(),
      email,
      kdfParams: JSON.stringify(body.kdfParams),
      loginHash: await hashServerSecret(body.loginHash),
      protectedAccountKey: body.protectedAccountKey,
      vaultRevision: 0,
      createdAt: new Date().toISOString(),
    })
    .run();

  return json({ ok: true }, 201);
}
