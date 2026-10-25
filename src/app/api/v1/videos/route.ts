import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { apiError, apiUser, publishErrorResponse, requestOrigin, videoJson } from "@/lib/api";
import { publishVideo, type PublishInput } from "@/lib/publish";

/** Your videos, newest first. */
export async function GET(request: Request) {
  const user = await apiUser(request, false);
  if (!user) return apiError(401, "unauthenticated");
  const rows = await db.select().from(videos).where(eq(videos.channelId, user.id)).orderBy(desc(videos.publishedAt)).limit(200);
  const origin = requestOrigin(request);
  return Response.json({ videos: rows.map((video) => videoJson(video, origin)) });
}

/**
 * Step two: publish an upload with its details. JSON body:
 *
 *   { "uploadId": "...", "title": "...", "description": "...",
 *     "visibility": "public" | "unlisted" | "private",
 *     "category": "drama", "tags": ["romance"],
 *     "aiUsage": "generated" | "assisted", "aiModels": ["Veo", "ElevenLabs"],
 *     "prompt": "...", "seriesId": "...", "episodeNumber": 3,
 *     "sourceApp": "DramaStudio", "thumbnailBase64": "<jpeg/png/webp>" }
 *
 * Only `uploadId` and `title` are required.
 */
export async function POST(request: Request) {
  const user = await apiUser(request, false);
  if (!user) return apiError(401, "unauthenticated");
  let body: PublishInput & { thumbnailBase64?: string };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "invalid", "Body must be JSON.");
  }
  const { thumbnailBase64, ...input } = body ?? ({} as typeof body);
  try {
    const video = await publishVideo(
      user.id,
      input,
      typeof thumbnailBase64 === "string" && thumbnailBase64 ? { data: Buffer.from(thumbnailBase64, "base64") } : null,
    );
    return Response.json(videoJson(video, requestOrigin(request)), { status: 201 });
  } catch (error) {
    return publishErrorResponse(error);
  }
}
