import { updateItemRequestSchema } from "@pw0d/api-client";
import { deleteItem, updateItem } from "@/server/vault";
import { apiError, isResponse, json, parseBody, requireAuth } from "@/server/http";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const auth = await requireAuth(request);
  if (isResponse(auth)) return auth;
  const body = await parseBody(request, updateItemRequestSchema);
  if (isResponse(body)) return body;

  const { id } = await context.params;
  const result = updateItem(auth.userId, id, body);
  if (result === "not_found") return apiError(404, "not_found", "item not found");
  if (result === "stale") {
    return apiError(409, "stale_write", "item changed since you loaded it — sync and retry");
  }
  return json(result);
}

export async function DELETE(request: Request, context: Context) {
  const auth = await requireAuth(request);
  if (isResponse(auth)) return auth;

  const { id } = await context.params;
  const result = deleteItem(auth.userId, id);
  if (result === "not_found") return apiError(404, "not_found", "item not found");
  return json(result);
}
