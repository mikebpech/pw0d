import { getSyncState } from "@/server/vault";
import { apiError, isResponse, json, requireAuth } from "@/server/http";

export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (isResponse(auth)) return auth;

  const sinceParam = new URL(request.url).searchParams.get("since");
  const since = sinceParam === null ? 0 : Number(sinceParam);
  if (!Number.isInteger(since) || since < 0) {
    return apiError(400, "invalid_request", "since must be a non-negative integer");
  }

  return json(getSyncState(auth.userId, since));
}
