import { revokeDevice } from "@/server/auth";
import { isResponse, json, requireAuth } from "@/server/http";

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (isResponse(auth)) return auth;
  await revokeDevice(auth.deviceId);
  return json({ ok: true });
}
