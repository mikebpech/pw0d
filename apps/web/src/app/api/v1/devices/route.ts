import { desc, eq } from "drizzle-orm";
import { db, tables } from "@/server/db";
import { isResponse, json, requireAuth } from "@/server/http";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (isResponse(auth)) return auth;

  const rows = db
    .select({
      id: tables.devices.id,
      name: tables.devices.name,
      createdAt: tables.devices.createdAt,
      lastSeenAt: tables.devices.lastSeenAt,
    })
    .from(tables.devices)
    .where(eq(tables.devices.userId, auth.userId))
    .orderBy(desc(tables.devices.lastSeenAt))
    .all();

  return json({
    devices: rows.map((row) => ({ ...row, current: row.id === auth.deviceId })),
  });
}
