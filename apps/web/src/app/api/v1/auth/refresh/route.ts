import { refreshRequestSchema } from "@pw0d/api-client";
import { clientKey, issueAccessToken, rateLimit, rotateRefreshToken } from "@/server/auth";
import { apiError, isResponse, json, parseBody } from "@/server/http";

export async function POST(request: Request) {
  if (!rateLimit(`refresh:${clientKey(request)}`, 30, 60_000)) {
    return apiError(429, "rate_limited", "too many attempts, slow down");
  }
  const body = await parseBody(request, refreshRequestSchema);
  if (isResponse(body)) return body;

  const rotated = await rotateRefreshToken(body.refreshToken);
  if (!rotated) return apiError(401, "invalid_refresh_token", "refresh token unknown or expired");

  return json({
    accessToken: await issueAccessToken(rotated.userId, rotated.deviceId),
    refreshToken: rotated.refreshToken,
  });
}
