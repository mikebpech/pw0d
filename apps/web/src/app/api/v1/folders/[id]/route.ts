import { deleteFolder } from "@/server/vault";
import { apiError, isResponse, json, requireAuth } from "@/server/http";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: Context) {
  const auth = await requireAuth(request);
  if (isResponse(auth)) return auth;

  const { id } = await context.params;
  const result = deleteFolder(auth.userId, id);
  if (result === "not_found") return apiError(404, "not_found", "folder not found");
  return json(result);
}
