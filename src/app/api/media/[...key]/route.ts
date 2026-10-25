import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { contentTypeFor, parseRange } from "@/lib/range";
import { isSafeKey, localPath, presignedGetUrl } from "@/lib/storage";
import { isPaidEpisode, locksFor, saleOf } from "@/lib/access";
import { canWatch } from "@/lib/videos";

/**
 * Every stored file is served from here unless the bucket is public.
 *
 * A video's file and thumbnail answer only to people who may watch the
 * video: a private one is the owner's, a removed one is the owner's and the
 * moderators'. Avatars and banners are public by nature. The check is one
 * primary-key lookup, which matters because a single playback is dozens of
 * Range requests.
 */
async function handle(request: Request, ctx: RouteContext<"/api/media/[...key]">, head: boolean) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  if (!isSafeKey(key)) return new Response("Not found", { status: 404 });

  // Avatars and banners get a new key when they change, so they cache forever.
  let cacheControl = "public, max-age=31536000, immutable";
  const [kind, videoId] = parts;
  if (kind === "videos" || kind === "thumbs") {
    const [video] = await db
      .select({
        id: videos.id,
        channelId: videos.channelId,
        visibility: videos.visibility,
        status: videos.status,
        seriesId: videos.seriesId,
        episodeNumber: videos.episodeNumber,
      })
      .from(videos)
      .where(eq(videos.id, videoId ?? ""))
      .limit(1);
    if (!video) return new Response("Not found", { status: 404 });
    const open = video.status === "ready" && video.visibility !== "private";
    let viewer: Awaited<ReturnType<typeof currentUser>> | undefined;
    const who = async () => (viewer === undefined ? (viewer = await currentUser()) : viewer);
    if (!open && !canWatch(video, await who())) return new Response("Not found", { status: 404 });

    // A paid episode's file goes only to its creator, the people who bought
    // it and moderators. The thumbnail stays public: it is the shop window.
    let paid = false;
    if (kind === "videos" && video.seriesId) {
      const sale = await saleOf(video.seriesId);
      paid = isPaidEpisode(sale, video.episodeNumber);
      if (paid) {
        const user = await who();
        const locked = (await locksFor(user ?? null, [video])).size > 0;
        if (locked) return new Response("This episode is locked", { status: 403 });
      }
    }
    // A video's key stays the same when it goes private, is taken down or
    // goes on sale, so a shared cache must never hold more than a few
    // minutes of a free public file, and never any paid or non-public one.
    cacheControl = open && video.visibility === "public" && !paid ? "public, max-age=300" : "private, no-store";
  } else if (kind !== "avatars" && kind !== "banners") {
    return new Response("Not found", { status: 404 });
  }

  if (env.storageDriver === "s3") {
    return new Response(null, {
      status: 302,
      headers: { Location: presignedGetUrl(key, 3600), "Cache-Control": "private, max-age=600" },
    });
  }

  let path: string;
  let size: number;
  try {
    path = localPath(key);
    const info = await stat(path);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
    size = info.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers({
    "Content-Type": contentTypeFor(key),
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
  });

  const range = parseRange(request.headers.get("range"), size);
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  headers.set("Content-Length", String(size === 0 ? 0 : end - start + 1));
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  const status = range ? 206 : 200;
  if (head || size === 0) return new Response(null, { status, headers });

  const stream = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(stream, { status, headers });
}

export function GET(request: Request, ctx: RouteContext<"/api/media/[...key]">) {
  return handle(request, ctx, false);
}

export function HEAD(request: Request, ctx: RouteContext<"/api/media/[...key]">) {
  return handle(request, ctx, true);
}
