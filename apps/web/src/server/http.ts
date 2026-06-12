/** Small helpers shared by all route handlers. */

import type { ZodType, ZodTypeDef } from "zod";
import { type AuthContext, authenticate } from "./auth";

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export function apiError(status: number, error: string, message: string): Response {
  return Response.json({ error, message }, { status });
}

export async function parseBody<T>(
  request: Request,
  schema: ZodType<T, ZodTypeDef, unknown>,
): Promise<T | Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError(400, "bad_json", "request body must be JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return apiError(400, "invalid_request", parsed.error.issues[0]?.message ?? "invalid request");
  }
  return parsed.data;
}

export async function requireAuth(request: Request): Promise<AuthContext | Response> {
  const auth = await authenticate(request);
  if (!auth) return apiError(401, "unauthorized", "missing or invalid access token");
  return auth;
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}
