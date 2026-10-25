import { apiError, apiUser, publishErrorResponse } from "@/lib/api";
import { sameOrigin } from "@/lib/origin";
import { receiveUpload } from "@/lib/publish";

/**
 * The upload page streams the file here while its details are typed. The
 * body is the raw file — not multipart — so it goes to disk as it arrives
 * and never sits in memory, whatever its size.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return apiError(403, "forbidden");
  const user = await apiUser(request, true);
  if (!user) return apiError(401, "unauthenticated");
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
