import { upsertFolderRequestSchema } from "@pw0d/api-client";
import { upsertFolder } from "@/server/vault";
import { isResponse, json, parseBody, requireAuth } from "@/server/http";

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (isResponse(auth)) return auth;
  const body = await parseBody(request, upsertFolderRequestSchema);
  if (isResponse(body)) return body;
  return json(upsertFolder(auth.userId, body), 201);
}
