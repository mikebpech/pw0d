import { DEFAULT_KDF_PARAMS } from "@pw0d/crypto";
import { preloginRequestSchema } from "@pw0d/api-client";
import { eq } from "drizzle-orm";
import { db, tables } from "@/server/db";
import { isResponse, json, parseBody } from "@/server/http";

/**
 * Returns the KDF params the client must use to derive keys for this email.
 * Unknown emails get the defaults — indistinguishable from real accounts
 * (every v1 account uses defaults), so this doesn't enable user enumeration.
 */
export async function POST(request: Request) {
  const body = await parseBody(request, preloginRequestSchema);
  if (isResponse(body)) return body;

  const user = db
    .select({ kdfParams: tables.users.kdfParams })
    .from(tables.users)
    .where(eq(tables.users.email, body.email.trim().toLowerCase()))
    .get();

  return json({ kdfParams: user ? JSON.parse(user.kdfParams) : DEFAULT_KDF_PARAMS });
}
