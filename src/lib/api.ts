import "server-only";
import { currentUser } from "./auth";
import { mediaUrl } from "./storage";
import { userFromBearer } from "./tokens";
import { PublishError } from "./publish";
import { env } from "./env";
import type { Series, Video } from "@/db/schema";
import type { SeriesInput } from "./studio";

/** A bearer token if one is sent, otherwise the browser's session cookie. */
export async function apiUser(request: Request, allowCookie: boolean) {
  const header = request.headers.get("authorization");
  if (header) return userFromBearer(header);
  return allowCookie ? currentUser() : null;
}

export function apiError(status: number, code: string, detail?: string) {
  return Response.json({ error: { code, ...(detail ? { detail } : {}) } }, { status });
}

const STATUS: Record<PublishError["code"], number> = {
  too_large: 413,
  empty: 400,
  not_a_video: 415,
  upload_missing: 404,
  bad_thumbnail: 400,
  series_missing: 404,
  invalid: 422,
  not_found: 404,
  too_many_uploads: 429,
};

export function publishErrorResponse(error: unknown) {
  if (error instanceof PublishError) return apiError(STATUS[error.code], error.code, error.detail);
  throw error;
}

function absolute(path: string | null, origin: string): string | null {
  if (!path) return null;
  return path.startsWith("http") ? path : `${origin}${path}`;
}

export function requestOrigin(request: Request): string {
  if (env.publicAppUrl) return env.publicAppUrl;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** The public shape of a video in API responses. */
export function videoJson(video: Video, origin: string) {
  return {
    id: video.id,
    url: `${origin}/watch/${video.id}`,
    embedUrl: `${origin}/embed/${video.id}`,
    title: video.title,
    description: video.description,
    visibility: video.visibility,
    status: video.status,
    category: video.category,
    tags: video.tags,
    aiUsage: video.aiUsage,
    aiModels: video.aiModels,
    prompt: video.prompt,
    sourceApp: video.sourceApp,
    seriesId: video.seriesId,
    episodeNumber: video.episodeNumber,
    durationSec: video.durationSec,
    width: video.width,
    height: video.height,
    thumbnailUrl: absolute(mediaUrl(video.thumbnailKey), origin),
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    commentCount: video.commentCount,
    publishedAt: video.publishedAt.toISOString(),
  };
}

/** A series as the API gives it back. */
export function seriesJson(row: Series, origin: string, episodeCount?: number) {
  return {
    id: row.id,
    url: `${origin}/series/${row.id}`,
    title: row.title,
    description: row.description,
    tropes: row.tropes,
    status: row.status,
    plannedEpisodes: row.plannedEpisodes,
    premiereAt: row.premiereAt?.toISOString() ?? null,
    posterUrl: absolute(mediaUrl(row.posterKey), origin),
    ...(episodeCount === undefined ? {} : { episodeCount }),
  };
}

/** What the API accepts for a series, on create and on update. */
export function seriesBody(body: Record<string, unknown>): { input: SeriesInput; poster: { data: Buffer } | null; removePoster: boolean } {
  const input: SeriesInput = {};
  if (body.title !== undefined) input.title = String(body.title);
  if (body.description !== undefined) input.description = String(body.description ?? "");
  if (body.tropes !== undefined) input.tropes = Array.isArray(body.tropes) ? body.tropes : [];
  if (body.status !== undefined) input.status = String(body.status);
  if (body.plannedEpisodes !== undefined) input.plannedEpisodes = body.plannedEpisodes as number | null;
  if (body.premiereAt !== undefined) input.premiereAt = body.premiereAt === null ? null : String(body.premiereAt);
  const poster = typeof body.posterBase64 === "string" && body.posterBase64 ? { data: Buffer.from(body.posterBase64, "base64") } : null;
  return { input, poster, removePoster: body.posterBase64 === null };
}

export const SERIES_ERRORS: Record<string, string> = {
  title: "title is required",
  status: "status must be ongoing or completed",
  planned: "plannedEpisodes must be a whole number from 1 to 2000",
  premiere: "premiereAt must be a date",
  poster: "poster must be a JPEG, PNG or WebP image under the size limit",
  not_found: "no such series of yours",
};
