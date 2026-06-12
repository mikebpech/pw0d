import { db, tables } from "@/server/db";
import { json } from "@/server/http";

/** Liveness + readiness: confirms the process is up and the DB is reachable. */
export async function GET() {
  try {
    db.select({ id: tables.users.id }).from(tables.users).limit(1).all();
    return json({ status: "ok", service: "pw0d" });
  } catch {
    return json({ status: "degraded", service: "pw0d" }, 503);
  }
}
