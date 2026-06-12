import { and, eq } from "drizzle-orm";
import { db, tables } from "@/server/db";
import { apiError, isResponse, json, requireAuth } from "@/server/http";

type Context = { params: Promise<{ id: string }> };

/** Revoke a session/device. Scoped to the caller's own devices only. */
export async function DELETE(request: Request, context: Context) {
  const auth = await requireAuth(request);
  if (isResponse(auth)) return auth;
  const { id } = await context.params;

  const device = db
    .select({ id: tables.devices.id })
    .from(tables.devices)
    .where(and(eq(tables.devices.id, id), eq(tables.devices.userId, auth.userId)))
    .get();
  if (!device) return apiError(404, "not_found", "device not found");

  db.delete(tables.devices).where(eq(tables.devices.id, id)).run();
  return json({ ok: true });
}
