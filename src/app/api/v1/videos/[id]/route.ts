import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { apiError, apiUser, publishErrorResponse, requestOrigin, videoJson } from "@/lib/api";
import { deleteVideo, updateVideo } from "@/lib/publish";

async function own(request: Request, id: string) {
  const user = await apiUser(request, false);
  if (!user) return { error: apiError(401, "unauthenticated") } as const;
  const [video] = await db.select().from(videos).where(and(eq(videos.id, id), eq(videos.channelId, user.id))).limit(1);
  if (!video) return { error: apiError(404, "not_found") } as const;
  return { user, video } as const;
}

export async function GET(request: Request, ctx: RouteContext<"/api/v1/videos/[id]">) {
  const found = await own(request, (await ctx.params).id);
  if ("error" in found) return found.error;
  return Response.json(videoJson(found.video, requestOrigin(request)));
}

/** Change any of the details; fields left out keep their current values. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/videos/[id]">) {
  const found = await own(request, (await ctx.params).id);
  if ("error" in found) return found.error;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "invalid", "Body must be JSON.");
  }
  const { video } = found;
  const merged = {
    title: video.title,
    description: video.description,
    visibility: video.visibility,
    category: video.category,
    tags: video.tags,
    aiUsage: video.aiUsage,
    aiModels: video.aiModels,
    prompt: video.prompt,
    seriesId: video.seriesId,
    episodeNumber: video.episodeNumber,
    ...body,
  } as Parameters<typeof updateVideo>[2];
  try {
    const thumb = typeof body.thumbnailBase64 === "string" ? { data: Buffer.from(body.thumbnailBase64, "base64") } : null;
    const updated = await updateVideo(found.user.id, video.id, merged, thumb);
    return Response.json(videoJson(updated, requestOrigin(request)));
  } catch (error) {
    return publishErrorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/v1/videos/[id]">) {
  const found = await own(request, (await ctx.params).id);
  if ("error" in found) return found.error;
  await deleteVideo(found.user.id, found.video.id);
  return new Response(null, { status: 204 });
}
