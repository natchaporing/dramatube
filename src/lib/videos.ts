import { and, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { reactions, series, subscriptions, users, videos, watchHistory, type User, type Video } from "@/db/schema";
import { mediaUrl } from "./storage";
import { isAdmin } from "./session";
import type { Category } from "./catalog";

/**
 * Reading videos: the feeds, search, a channel's shelf, what plays next.
 *
 * Every public list goes through `listed`, the one definition of what a
 * stranger may see. An unlisted video is reachable by its link and never
 * appears in a list; a removed one appears nowhere except to its owner.
 */
export const listed = and(eq(videos.visibility, "public"), eq(videos.status, "ready"))!;

export interface ChannelRef {
  id: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
}

export interface VideoCard {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  durationSec: number;
  width: number;
  height: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: Date;
  aiUsage: "generated" | "assisted";
  aiModels: string[];
  visibility: "public" | "unlisted" | "private";
  status: "ready" | "removed";
  episodeNumber: number | null;
  channel: ChannelRef;
  /** Seconds watched, when the list is somebody's history. */
  positionSec?: number;
}

const cardColumns = {
  id: videos.id,
  title: videos.title,
  thumbnailKey: videos.thumbnailKey,
  durationSec: videos.durationSec,
  width: videos.width,
  height: videos.height,
  viewCount: videos.viewCount,
  likeCount: videos.likeCount,
  commentCount: videos.commentCount,
  publishedAt: videos.publishedAt,
  aiUsage: videos.aiUsage,
  aiModels: videos.aiModels,
  visibility: videos.visibility,
  status: videos.status,
  episodeNumber: videos.episodeNumber,
  channelId: users.id,
  channelHandle: users.handle,
  channelName: users.name,
  channelAvatarKey: users.avatarKey,
};

type CardRow = {
  id: string;
  title: string;
  thumbnailKey: string | null;
  durationSec: number;
  width: number;
  height: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: Date;
  aiUsage: "generated" | "assisted";
  aiModels: string[];
  visibility: "public" | "unlisted" | "private";
  status: "ready" | "removed";
  episodeNumber: number | null;
  channelId: string;
  channelHandle: string;
  channelName: string;
  channelAvatarKey: string | null;
};

export function toCard(row: CardRow): VideoCard {
  return {
    id: row.id,
    title: row.title,
    thumbnailUrl: mediaUrl(row.thumbnailKey),
    durationSec: row.durationSec,
    width: row.width,
    height: row.height,
    viewCount: row.viewCount,
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    publishedAt: row.publishedAt,
    aiUsage: row.aiUsage,
    aiModels: row.aiModels,
    visibility: row.visibility,
    status: row.status,
    episodeNumber: row.episodeNumber,
    channel: {
      id: row.channelId,
      handle: row.channelHandle,
      name: row.channelName,
      avatarUrl: mediaUrl(row.channelAvatarKey),
    },
  };
}

export function channelRef(user: Pick<User, "id" | "handle" | "name" | "avatarKey">): ChannelRef {
  return { id: user.id, handle: user.handle, name: user.name, avatarUrl: mediaUrl(user.avatarKey) };
}

function cards() {
  return db.select(cardColumns).from(videos).innerJoin(users, eq(users.id, videos.channelId));
}

/**
 * Trending: engagement over age, the shape every ranked feed converges on.
 * A like is worth a few views; the age term means last week's hit gives way
 * to today's without anybody deciding it should.
 */
const trendingScore = sql`(${videos.viewCount} + 4 * ${videos.likeCount} + 2 * ${videos.commentCount} + 1)
  / power(extract(epoch from (now() - ${videos.publishedAt})) / 3600 + 2, 1.4)`;

const verticalOnly = sql`${videos.height} > ${videos.width}`;
const horizontalOnly = sql`${videos.height} <= ${videos.width}`;

export type FeedSort = "trending" | "latest" | "popular";

export async function listFeed(opts: {
  category?: Category | null;
  sort?: FeedSort;
  shape?: "vertical" | "horizontal" | "any";
  limit?: number;
  offset?: number;
}): Promise<VideoCard[]> {
  const where: SQL[] = [listed];
  if (opts.category) where.push(eq(videos.category, opts.category));
  if (opts.shape === "vertical") where.push(verticalOnly);
  if (opts.shape === "horizontal") where.push(horizontalOnly);
  const order =
    opts.sort === "latest"
      ? [desc(videos.publishedAt)]
      : opts.sort === "popular"
        ? [desc(videos.viewCount), desc(videos.publishedAt)]
        : [desc(trendingScore), desc(videos.publishedAt)];
  const rows = await cards()
    .where(and(...where))
    .orderBy(...order)
    .limit(opts.limit ?? 48)
    .offset(opts.offset ?? 0);
  return rows.map(toCard);
}

/** The vertical feed, ranked like the home page, optionally led by one video. */
export async function listVertical(opts: { leadId?: string | null; limit?: number }): Promise<VideoCard[]> {
  const rows = await cards()
    .where(and(listed, verticalOnly))
    .orderBy(desc(trendingScore), desc(videos.publishedAt))
    .limit(opts.limit ?? 30);
  const list = rows.map(toCard);
  if (!opts.leadId) return list;
  const existing = list.findIndex((card) => card.id === opts.leadId);
  if (existing > 0) return [list[existing], ...list.filter((_, index) => index !== existing)];
  if (existing === 0) return list;
  const [lead] = await cards()
    .where(and(eq(videos.id, opts.leadId), eq(videos.status, "ready"), ne(videos.visibility, "private")))
    .limit(1);
  return lead ? [toCard(lead), ...list] : list;
}

export async function listChannelVideos(
  channelId: string,
  opts: { includeHidden: boolean; sort?: "latest" | "popular"; limit?: number },
): Promise<VideoCard[]> {
  const rows = await cards()
    .where(opts.includeHidden ? eq(videos.channelId, channelId) : and(eq(videos.channelId, channelId), listed))
    .orderBy(...(opts.sort === "popular" ? [desc(videos.viewCount)] : []), desc(videos.publishedAt))
    .limit(opts.limit ?? 120);
  return rows.map(toCard);
}

export async function listSubscriptionFeed(userId: string, limit = 60): Promise<VideoCard[]> {
  const followed = db
    .select({ id: subscriptions.channelId })
    .from(subscriptions)
    .where(eq(subscriptions.subscriberId, userId));
  const rows = await cards()
    .where(and(listed, inArray(videos.channelId, followed)))
    .orderBy(desc(videos.publishedAt))
    .limit(limit);
  return rows.map(toCard);
}

export async function listHistory(userId: string, limit = 100): Promise<VideoCard[]> {
  const rows = await db
    .select({ ...cardColumns, positionSec: watchHistory.positionSec })
    .from(watchHistory)
    .innerJoin(videos, eq(videos.id, watchHistory.videoId))
    .innerJoin(users, eq(users.id, videos.channelId))
    .where(and(eq(watchHistory.userId, userId), eq(videos.status, "ready"), ne(videos.visibility, "private")))
    .orderBy(desc(watchHistory.watchedAt))
    .limit(limit);
  return rows.map((row) => ({ ...toCard(row), positionSec: row.positionSec }));
}

export async function listLiked(userId: string, limit = 100): Promise<VideoCard[]> {
  const rows = await db
    .select(cardColumns)
    .from(reactions)
    .innerJoin(videos, eq(videos.id, reactions.videoId))
    .innerJoin(users, eq(users.id, videos.channelId))
    .where(and(eq(reactions.userId, userId), eq(reactions.value, 1), eq(videos.status, "ready"), ne(videos.visibility, "private")))
    .orderBy(desc(reactions.createdAt))
    .limit(limit);
  return rows.map(toCard);
}

/** `%` and `_` are wildcards to ILIKE; a search for "100%" means the character. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** Words to match, at most eight, each at most forty characters. */
export function searchTerms(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map((term) => term.slice(0, 40))
    .filter(Boolean)
    .slice(0, 8);
}

/**
 * Search by substring rather than by word. Thai is written without spaces
 * between words, so a word index finds nothing in it; a substring match on
 * title, description, tags, models and channel name finds what a person
 * typed in either language. At the size this site starts at that is fast
 * enough, and `pg_trgm` is the index to add when it is not.
 */
export async function searchVideos(opts: {
  query: string;
  model?: string | null;
  category?: Category | null;
  sort?: "relevance" | "latest" | "views";
  limit?: number;
}): Promise<VideoCard[]> {
  const where: SQL[] = [listed];
  for (const term of searchTerms(opts.query)) {
    const like = `%${escapeLike(term)}%`;
    where.push(
      or(
        ilike(videos.title, like),
        ilike(videos.description, like),
        ilike(users.name, like),
        ilike(users.handle, like),
        sql`array_to_string(${videos.tags}, ' ') ilike ${like}`,
        sql`array_to_string(${videos.aiModels}, ' ') ilike ${like}`,
      )!,
    );
  }
  if (opts.model) where.push(sql`lower(${opts.model}) = any(select lower(m) from unnest(${videos.aiModels}) m)`);
  if (opts.category) where.push(eq(videos.category, opts.category));

  // Title matches first, then by trending. (A bare constant in ORDER BY is a
  // column position to Postgres, so with no words there is no title term.)
  const first = searchTerms(opts.query)[0];
  const titleHit = first ? [sql`case when ${videos.title} ilike ${`%${escapeLike(first)}%`} then 0 else 1 end`] : [];
  const order =
    opts.sort === "latest"
      ? [desc(videos.publishedAt)]
      : opts.sort === "views"
        ? [desc(videos.viewCount)]
        : [...titleHit, desc(trendingScore)];

  const rows = await cards()
    .where(and(...where))
    .orderBy(...order)
    .limit(opts.limit ?? 60);
  return rows.map(toCard);
}

export interface WatchVideo extends Video {
  channel: ChannelRef & { subscriberCount: number };
  thumbnailUrl: string | null;
  videoUrl: string;
  seriesTitle: string | null;
}

export type Viewer = Pick<User, "id" | "email" | "role"> | null;

export function canWatch(video: Pick<Video, "channelId" | "visibility" | "status">, viewer: Viewer): boolean {
  if (viewer && (viewer.id === video.channelId || isAdmin(viewer))) return true;
  return video.status === "ready" && video.visibility !== "private";
}

/** A video with its channel, or null if it does not exist or may not be seen. */
export async function getWatchable(id: string, viewer: Viewer): Promise<WatchVideo | null> {
  const [row] = await db
    .select({ video: videos, channel: users, seriesTitle: series.title })
    .from(videos)
    .innerJoin(users, eq(users.id, videos.channelId))
    .leftJoin(series, eq(series.id, videos.seriesId))
    .where(eq(videos.id, id))
    .limit(1);
  if (!row || !canWatch(row.video, viewer)) return null;
  return {
    ...row.video,
    channel: { ...channelRef(row.channel), subscriberCount: row.channel.subscriberCount },
    thumbnailUrl: mediaUrl(row.video.thumbnailKey),
    videoUrl: mediaUrl(row.video.videoKey)!,
    seriesTitle: row.seriesTitle,
  };
}

export async function seriesEpisodes(seriesId: string, includeHidden = false): Promise<VideoCard[]> {
  const rows = await cards()
    .where(includeHidden ? eq(videos.seriesId, seriesId) : and(eq(videos.seriesId, seriesId), eq(videos.status, "ready"), ne(videos.visibility, "private")))
    .orderBy(sql`${videos.episodeNumber} asc nulls last`, videos.publishedAt);
  return rows.map(toCard);
}

/**
 * What plays next: the next episode first when this is part of a series,
 * then more from the same channel, then the same category, then whatever is
 * trending. Each source fills only what the ones before it left.
 */
export async function upNext(video: Pick<Video, "id" | "channelId" | "category" | "seriesId" | "episodeNumber">, limit = 20) {
  const picked = new Map<string, VideoCard>();
  const add = (list: VideoCard[]) => {
    for (const card of list) if (card.id !== video.id && picked.size < limit) picked.set(card.id, card);
  };

  let nextEpisode: VideoCard | null = null;
  if (video.seriesId) {
    const episodes = (await seriesEpisodes(video.seriesId)).filter((card) => card.visibility === "public");
    const index = episodes.findIndex((card) => card.id === video.id);
    nextEpisode = index >= 0 ? episodes[index + 1] ?? null : episodes[0] ?? null;
    if (nextEpisode) add([nextEpisode]);
  }

  const notThis = ne(videos.id, video.id);
  add((await cards().where(and(listed, notThis, eq(videos.channelId, video.channelId))).orderBy(desc(trendingScore)).limit(6)).map(toCard));
  add((await cards().where(and(listed, notThis, eq(videos.category, video.category))).orderBy(desc(trendingScore)).limit(12)).map(toCard));
  if (picked.size < limit) add(await listFeed({ limit: limit + 1 }));

  return { nextEpisode, items: [...picked.values()] };
}

export async function channelByHandle(handle: string) {
  const [user] = await db.select().from(users).where(eq(users.handle, handle.toLowerCase())).limit(1);
  return user ?? null;
}

export async function subscribedChannels(userId: string, limit = 50): Promise<ChannelRef[]> {
  const rows = await db
    .select({ id: users.id, handle: users.handle, name: users.name, avatarKey: users.avatarKey })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.channelId))
    .where(eq(subscriptions.subscriberId, userId))
    .orderBy(users.name)
    .limit(limit);
  return rows.map(channelRef);
}

export async function channelStats(channelId: string) {
  const [row] = await db
    .select({
      videos: sql<number>`count(*)::int`,
      views: sql<number>`coalesce(sum(${videos.viewCount}), 0)::int`,
      likes: sql<number>`coalesce(sum(${videos.likeCount}), 0)::int`,
      comments: sql<number>`coalesce(sum(${videos.commentCount}), 0)::int`,
    })
    .from(videos)
    .where(eq(videos.channelId, channelId));
  return row;
}

export async function listPublicCount(channelId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(videos).where(and(eq(videos.channelId, channelId), listed));
  return row?.n ?? 0;
}

export interface SeriesSummary {
  id: string;
  title: string;
  description: string;
  episodeCount: number;
  coverUrl: string | null;
  firstEpisodeId: string | null;
  updatedAt: Date;
}

/**
 * A channel's series, each with how many episodes a stranger can see and the
 * first one's thumbnail as its cover. `includeEmpty` is for the owner's
 * studio, where a series with nothing in it yet still needs to be listed.
 */
export async function listSeries(channelId: string, includeEmpty = false): Promise<SeriesSummary[]> {
  const rows = await db
    .select({
      id: series.id,
      title: series.title,
      description: series.description,
      updatedAt: series.updatedAt,
      episodeCount: sql<number>`(select count(*)::int from ${videos} v where v.series_id = ${series.id} and v.visibility = 'public' and v.status = 'ready')`,
      first: sql<string | null>`(select v.id || ' ' || coalesce(v.thumbnail_key, '') from ${videos} v
        where v.series_id = ${series.id} and v.visibility = 'public' and v.status = 'ready'
        order by v.episode_number asc nulls last, v.published_at asc limit 1)`,
    })
    .from(series)
    .where(eq(series.channelId, channelId))
    .orderBy(desc(series.updatedAt));
  return rows
    .filter((row) => includeEmpty || row.episodeCount > 0)
    .map((row) => {
      const [firstId, thumbKey] = row.first ? row.first.split(" ") : [null, null];
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        episodeCount: row.episodeCount,
        coverUrl: mediaUrl(thumbKey || null),
        firstEpisodeId: firstId,
        updatedAt: row.updatedAt,
      };
    });
}
