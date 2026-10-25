import { apiError, apiUser, publishErrorResponse } from "@/lib/api";
import { receiveUpload } from "@/lib/publish";

/**
 * Step one of publishing from a tool: POST the raw video bytes.
 *
 *   curl -X POST "$DRAMATUBE/api/v1/uploads" \
 *     -H "Authorization: Bearer $TOKEN" -H "Content-Type: video/mp4" \
 *     --data-binary @film.mp4
 *
 * Answers `{ uploadId }`, which step two (`POST /api/v1/videos`) publishes.
 */
export async function POST(request: Request) {
  const user = await apiUser(request, false);
  if (!user) return apiError(401, "unauthenticated", "Send Authorization: Bearer <token> (create one in Studio → API).");
  try {
    const length = Number(request.headers.get("content-length"));
    const result = await receiveUpload({
      userId: user.id,
      body: request.body,
      declaredLength: Number.isFinite(length) ? length : null,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return publishErrorResponse(error);
  }
}
