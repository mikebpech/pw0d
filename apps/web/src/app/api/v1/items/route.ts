import { createItemRequestSchema } from "@pw0d/api-client";
import { createItem } from "@/server/vault";
import { apiError, isResponse, json, parseBody, requireAuth } from "@/server/http";

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (isResponse(auth)) return auth;
  const body = await parseBody(request, createItemRequestSchema);
  if (isResponse(body)) return body;

  const result = createItem(auth.userId, body);
  if (result === "conflict") return apiError(409, "id_conflict", "an item with this id exists");
  return json(result, 201);
}
