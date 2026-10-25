import { createWriteStream } from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, count, eq, lt, max, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { series, uploads, videos, type Video } from "@/db/schema";
import {
  AI_USAGE,
  CATEGORIES,
  LIMITS,
  VISIBILITIES,
  parseModels,
  parseTags,
} from "./catalog";
import { env } from "./env";
import { newId, newObjectName, newVideoId } from "./ids";
import {
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  extractThumbnail,
  faststart,
  hasFfmpeg,
  probeVideo,
  readHead,
  sniffImage,
  sniffVideo,
  type AcceptedVideoType,
} from "./media";
import { deleteObject, putBuffer, putFile, uploadDir } from "./storage";

/**
 * From bytes on the wire to a video on the site.
 *
 * Two steps, as on every upload page people already know: the file streams
 * in while its details are typed (`receiveUpload`), then publishing checks
 * what arrived and moves it into storage (`publishVideo`). The browser and
 * the API go through exactly the same two functions.
 */

export class PublishError extends Error {
  constructor(
    public readonly code:
      | "too_large"
      | "empty"
      | "not_a_video"
      | "upload_missing"
      | "bad_thumbnail"
      | "series_missing"
      | "invalid"
      | "not_found"
      | "too_many_uploads",
    public readonly detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

/** Unpublished uploads are deleted after this long. */
const STALE_UPLOAD_MS = 6 * 60 * 60 * 1000;
/**
 * At most this many files may wait unpublished per account, counting ones
 * still streaming in. Without a cap, one free account can fill the disk with
 * two-gigabyte files it never intends to publish.
 */
export const MAX_PENDING_UPLOADS = 3;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/* Streams in progress, per account. Per process: run more than one web
   server and each enforces its own share, which still bounds the total. */
const streaming = new Map<string, number>();

/** Stream a request body to disk, refusing it the moment it passes the limit. */
export async function receiveUpload(opts: {
  userId: string;
  body: ReadableStream<Uint8Array> | null;
  declaredLength?: number | null;
}): Promise<{ uploadId: string; byteSize: number; mimeType: AcceptedVideoType }> {
  const limit = env.uploadMaxBytes;
  if (!opts.body) throw new PublishError("empty");
  if (opts.declaredLength && opts.declaredLength > limit) throw new PublishError("too_large");

  void purgeStaleUploads().catch(() => {});

  const [{ waiting }] = await db.select({ waiting: count() }).from(uploads).where(eq(uploads.userId, opts.userId));
  const inProgress = streaming.get(opts.userId) ?? 0;
  if (waiting + inProgress >= MAX_PENDING_UPLOADS) throw new PublishError("too_many_uploads");
  streaming.set(opts.userId, inProgress + 1);
  try {
    return await streamToDisk(opts.userId, opts.body, limit);
  } finally {
    const left = (streaming.get(opts.userId) ?? 1) - 1;
    if (left > 0) streaming.set(opts.userId, left);
    else streaming.delete(opts.userId);
  }
}

async function streamToDisk(userId: string, body: ReadableStream<Uint8Array>, limit: number) {
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  const uploadId = newId("upl");
  const path = join(dir, `${uploadId}.part`);

  let received = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > limit) callback(new PublishError("too_large"));
      else callback(null, chunk);
    },
  });

  try {
    await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream), meter, createWriteStream(path));
    if (received === 0) throw new PublishError("empty");
    const mimeType = sniffVideo(await readHead(path));
    if (!mimeType) throw new PublishError("not_a_video");
    await db.insert(uploads).values({ id: uploadId, userId, path, mimeType, byteSize: received });
    return { uploadId, byteSize: received, mimeType };
  } catch (error) {
    await unlink(path).catch(() => {});
    throw error;
  }
}

let lastPurge = 0;

/**
 * Delete what nobody published: rows older than `STALE_UPLOAD_MS` with their
 * files, and any file in the upload directory that has not been written to
 * for that long and has no row — a stream cut off by a crash or a restart
 * before its row was written, or a faststart copy a crash left behind.
 * Runs at most every ten minutes per process, whoever triggers it.
 */
export async function purgeStaleUploads(force = false): Promise<number> {
  if (!force && Date.now() - lastPurge < 10 * 60 * 1000) return 0;
  lastPurge = Date.now();
  const cutoff = Date.now() - STALE_UPLOAD_MS;
  const stale = await db
    .delete(uploads)
    .where(lt(uploads.createdAt, new Date(cutoff)))
    .returning({ path: uploads.path });
  await Promise.all(stale.map((row) => unlink(row.path).catch(() => {})));

  let orphans = 0;
  const dir = uploadDir();
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return stale.length;
  }
  const live = new Set((await db.select({ id: uploads.id }).from(uploads)).map((row) => row.id));
  for (const name of names) {
    if (live.has(name.split(".")[0])) continue;
    const path = join(dir, name);
    try {
      const info = await stat(path);
      if (info.isFile() && info.mtimeMs < cutoff) {
        await unlink(path);
        orphans++;
      }
    } catch {
      /* gone already */
    }
  }
  return stale.length + orphans;
}

const optionalText = (limit: number) =>
  z
    .string()
    .max(limit)
    .nullish()
    .transform((value) => (value && value.trim() ? value.trim() : null));

const optionalNumber = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((value) => {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  });

const listInput = z.union([z.string(), z.array(z.string())]).nullish();

/** The fields a creator sets on a video, shared by the form and the API. */
export const videoDetails = z.object({
  title: z.string().trim().min(1, "title").max(LIMITS.title),
  description: z.string().max(LIMITS.description).nullish().transform((value) => value?.trim() ?? ""),
  visibility: z.enum(VISIBILITIES).default("public"),
  category: z.enum(CATEGORIES).default("other"),
  tags: listInput.transform((value) => parseTags(value ?? [])),
  aiUsage: z.enum(AI_USAGE).default("generated"),
  aiModels: listInput.transform((value) => parseModels(value ?? [])),
  prompt: optionalText(LIMITS.prompt),
  seriesId: z.string().max(64).nullish().transform((value) => value || null),
  episodeNumber: optionalNumber.transform((value) =>
    value === null ? null : Math.max(0, Math.min(10_000, Math.round(value))),
  ),
});
export type VideoDetails = z.output<typeof videoDetails>;

export const publishInput = videoDetails.extend({
  uploadId: z.string().min(1).max(64),
  sourceApp: optionalText(40),
  /** What the browser read from the file, used only when ffprobe is absent. */
  clientDurationSec: optionalNumber,
  clientWidth: optionalNumber,
  clientHeight: optionalNumber,
});
export type PublishInput = z.input<typeof publishInput>;

export interface ImageInput {
  data: Buffer;
}

export function checkImage(image: ImageInput | null | undefined) {
  if (!image || image.data.length === 0) return null;
  if (image.data.length > MAX_IMAGE_BYTES) throw new PublishError("bad_thumbnail", "too large");
  const type = sniffImage(image.data);
  if (!type) throw new PublishError("bad_thumbnail", "not a JPEG, PNG or WebP image");
  return { data: image.data, type, ext: IMAGE_EXTENSIONS[type] };
}

async function resolveSeries(channelId: string, seriesId: string | null, episodeNumber: number | null, exceptVideoId?: string) {
  if (!seriesId) return { seriesId: null, episodeNumber: null };
  const [owned] = await db
    .select({ id: series.id })
    .from(series)
    .where(and(eq(series.id, seriesId), eq(series.channelId, channelId)))
    .limit(1);
  if (!owned) throw new PublishError("series_missing");
  if (episodeNumber !== null) return { seriesId, episodeNumber };
  // No number given: it is the next episode.
  const [row] = await db
    .select({ last: max(videos.episodeNumber) })
    .from(videos)
    .where(and(eq(videos.seriesId, seriesId), exceptVideoId ? ne(videos.id, exceptVideoId) : undefined));
  return { seriesId, episodeNumber: (row?.last ?? 0) + 1 };
}

const clampDimension = (value: number | null) => (value && value > 0 && value < 20_000 ? Math.round(value) : 0);

export async function publishVideo(
  userId: string,
  raw: PublishInput,
  thumbnail?: ImageInput | null,
): Promise<Video> {
  const parsed = publishInput.safeParse(raw);
  if (!parsed.success) throw new PublishError("invalid", parsed.error.issues.map((issue) => issue.path.join(".") || issue.message).join(", "));
  const input = parsed.data;

  // Everything that can be checked without the file, before claiming it.
  const image = checkImage(thumbnail);
  const placement = await resolveSeries(userId, input.seriesId, input.episodeNumber);

  /*
   * Claim the upload by deleting its row. Exactly one request can win that
   * delete, so two publishes of one upload — a double click, a retrying
   * client — produce one video, not two, and never work on the same file at
   * once. If anything below fails while the file is still where it was, the
   * row is put back so the person can try again without re-uploading.
   */
  const [upload] = await db
    .delete(uploads)
    .where(and(eq(uploads.id, input.uploadId), eq(uploads.userId, userId)))
    .returning();
  if (!upload) throw new PublishError("upload_missing");

  let moved = false;
  const id = newVideoId();
  let videoKey: string | null = null;
  let thumbnailKey: string | null = null;
  try {
    try {
      await stat(upload.path);
    } catch {
      throw new PublishError("upload_missing");
    }

    let mimeType = upload.mimeType as AcceptedVideoType;
    let durationSec = Math.max(0, input.clientDurationSec ?? 0);
    let width = clampDimension(input.clientWidth);
    let height = clampDimension(input.clientHeight);
    const ffmpeg = await hasFfmpeg();
    if (ffmpeg) {
      const probe = await probeVideo(upload.path);
      if (!probe) {
        await unlink(upload.path).catch(() => {});
        throw new PublishError("not_a_video");
      }
      ({ durationSec, width, height } = probe);
      mimeType = await faststart(upload.path, mimeType);
    }

    let thumbData = image?.data ?? null;
    let thumbExt = image?.ext ?? "jpg";
    let thumbType: string = image?.type ?? "image/jpeg";
    if (!thumbData && ffmpeg) {
      thumbData = await extractThumbnail(upload.path, Math.min(5, durationSec * 0.1));
      thumbExt = "jpg";
      thumbType = "image/jpeg";
    }

    videoKey = `videos/${id}/${newObjectName()}.${VIDEO_EXTENSIONS[mimeType]}`;
    thumbnailKey = thumbData ? `thumbs/${id}/${newObjectName()}.${thumbExt}` : null;
    const { size: byteSize } = await stat(upload.path);

    if (thumbData && thumbnailKey) await putBuffer(thumbnailKey, thumbData, thumbType);
    await putFile(videoKey, upload.path, mimeType);
    moved = true;
    const [video] = await db
      .insert(videos)
      .values({
        id,
        channelId: userId,
        title: input.title,
        description: input.description,
        visibility: input.visibility,
        category: input.category,
        tags: input.tags,
        aiUsage: input.aiUsage,
        aiModels: input.aiModels,
        prompt: input.prompt,
        sourceApp: input.sourceApp,
        seriesId: placement.seriesId,
        episodeNumber: placement.episodeNumber,
        videoKey,
        mimeType,
        byteSize,
        thumbnailKey,
        durationSec,
        width,
        height,
      })
      .returning();
    return video;
  } catch (error) {
    await deleteObject(thumbnailKey).catch(() => {});
    if (moved) await deleteObject(videoKey).catch(() => {});
    const fileStillThere = await stat(upload.path).then(() => true, () => false);
    if (fileStillThere) await db.insert(uploads).values(upload).onConflictDoNothing();
    throw error;
  }
}

async function ownedVideo(userId: string, videoId: string, asAdmin = false) {
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video || (video.channelId !== userId && !asAdmin)) throw new PublishError("not_found");
  return video;
}

export async function updateVideo(
  userId: string,
  videoId: string,
  raw: z.input<typeof videoDetails>,
  thumbnail?: ImageInput | null,
): Promise<Video> {
  const video = await ownedVideo(userId, videoId);
  const parsed = videoDetails.safeParse(raw);
  if (!parsed.success) throw new PublishError("invalid", parsed.error.issues.map((issue) => issue.path.join(".")).join(", "));
  const input = parsed.data;
  const image = checkImage(thumbnail);

  const placement =
    input.seriesId === video.seriesId && input.episodeNumber === null
      ? { seriesId: video.seriesId, episodeNumber: video.episodeNumber }
      : await resolveSeries(video.channelId, input.seriesId, input.episodeNumber, video.id);

  let thumbnailKey = video.thumbnailKey;
  if (image) {
    thumbnailKey = `thumbs/${video.id}/${newObjectName()}.${image.ext}`;
    await putBuffer(thumbnailKey, image.data, image.type);
  }

  const [updated] = await db
    .update(videos)
    .set({
      title: input.title,
      description: input.description,
      visibility: input.visibility,
      category: input.category,
      tags: input.tags,
      aiUsage: input.aiUsage,
      aiModels: input.aiModels,
      prompt: input.prompt,
      seriesId: placement.seriesId,
      episodeNumber: placement.episodeNumber,
      thumbnailKey,
      updatedAt: new Date(),
    })
    .where(eq(videos.id, video.id))
    .returning();

  if (image && video.thumbnailKey) await deleteObject(video.thumbnailKey).catch(() => {});
  return updated;
}

/** Rows first, then files: a file without a row is invisible, a row without a file is a broken page. */
export async function deleteVideo(userId: string, videoId: string, asAdmin = false): Promise<void> {
  const video = await ownedVideo(userId, videoId, asAdmin);
  await db.delete(videos).where(eq(videos.id, video.id));
  await deleteObject(video.videoKey).catch(() => {});
  await deleteObject(video.thumbnailKey).catch(() => {});
}
