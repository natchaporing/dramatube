import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { myList, videos } from "@/db/schema";
import { continuePoint, type ContinuePoint } from "./continue";
import { mediaUrl } from "./storage";
import type { Trope } from "./tropes";
import { listed, type ChannelRef } from "./videos";

/**
 * Series as shows: the shelves of the drama home, My List, and where each
 * viewer is in the series they have started.
 *
 * Every number here counts public, ready episodes only — what a stranger can
 * watch — so an unlisted or removed episode never shows through a poster.
 */

export interface SeriesCard {
  id: string;
  title: string;
  description: string;
  /** The creator's poster, if they made one. */
  posterUrl: string | null;
  /** Otherwise the first episode's picture, in whatever shape the episode is. */
  coverUrl: string | null;
  coverWidth: number;
  coverHeight: number;
  tropes: string[];
  status: "ongoing" | "completed";
  episodeCount: number;
  plannedEpisodes: number | null;
  totalViews: number;
  premiereAt: Date | null;
  firstEpisodeId: string | null;
  firstPublishedAt: Date | null;
  latestPublishedAt: Date | null;
  onSale: boolean;
  freeEpisodes: number;
  channel: ChannelRef;
  /** First episode out in the last two weeks. */
  isNew: boolean;
  /** Announced, nothing out yet. */
  upcoming: boolean;
}

export type Shelf = "popular" | "new" | "rankings" | "coming";

const NEW_DAYS = 30;

const date = (value: unknown) => (value === null || value === undefined ? null : new Date(value as string));

/** Raw rows come back with Postgres arrays as JS arrays, or as `{a,b}` text through some drivers. */
function textArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string" && value.startsWith("{")) {
    const inner = value.slice(1, -1);
    return inner ? inner.split(",").map((item) => item.replace(/^"|"$/g, "")) : [];
  }
  return [];
}

const NEW_BADGE_DAYS = 14;

function toSeriesCard(row: Record<string, unknown>): SeriesCard {
  const now = Date.now();
  const first = date(row.first_published);
  const premiere = date(row.premiere_at);
  const episodes = Number(row.episode_count ?? 0);
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description ?? ""),
    posterUrl: mediaUrl((row.poster_key as string | null) ?? null),
    coverUrl: mediaUrl((row.first_thumb as string | null) || null),
    coverWidth: Number(row.first_width ?? 0),
    coverHeight: Number(row.first_height ?? 0),
    tropes: textArray(row.tropes),
    status: row.status === "completed" ? "completed" : "ongoing",
    episodeCount: episodes,
    plannedEpisodes: row.planned_episodes === null || row.planned_episodes === undefined ? null : Number(row.planned_episodes),
    totalViews: Number(row.total_views ?? 0),
    premiereAt: premiere,
    firstEpisodeId: (row.first_id as string | null) ?? null,
    firstPublishedAt: first,
    latestPublishedAt: date(row.latest_published),
    onSale: row.on_sale === true,
    freeEpisodes: Number(row.free_episodes ?? 0),
    channel: {
      id: String(row.channel_id),
      handle: String(row.handle),
      name: String(row.channel_name),
      avatarUrl: mediaUrl((row.avatar_key as string | null) ?? null),
    },
    isNew: first !== null && now - first.getTime() < NEW_BADGE_DAYS * 86_400_000,
    upcoming: episodes === 0 && premiere !== null && premiere.getTime() > now,
  };
}

/**
 * Series with their public episodes summed up: count, plays, first and
 * latest release, and a trending score — each episode's engagement over its
 * age, the same curve as the video feed, added up over the series.
 */
async function seriesCards(opts: { where: SQL; order: SQL; limit: number; join?: SQL }): Promise<SeriesCard[]> {
  const rows = await db.execute(sql`
    select s.id, s.title, s.description, s.poster_key, s.tropes, s.status, s.planned_episodes, s.premiere_at,
           s.on_sale, s.free_episodes, s.channel_id, u.handle, u.name as channel_name, u.avatar_key,
           agg.episode_count, agg.total_views, agg.first_published, agg.latest_published, agg.score,
           f.id as first_id, f.thumbnail_key as first_thumb, f.width as first_width, f.height as first_height
    from series s
    join users u on u.id = s.channel_id
    ${opts.join ?? sql``}
    cross join lateral (
      select count(*)::int as episode_count,
             coalesce(sum(v.view_count), 0)::float8 as total_views,
             min(v.published_at) as first_published,
             max(v.published_at) as latest_published,
             coalesce(sum((v.view_count + 4 * v.like_count + 2 * v.comment_count + 1)
               / power(extract(epoch from (now() - v.published_at)) / 3600 + 2, 1.4)), 0)::float8 as score
      from videos v
      where v.series_id = s.id and v.visibility = 'public' and v.status = 'ready'
    ) agg
    left join lateral (
      select v.id, v.thumbnail_key, v.width, v.height
      from videos v
      where v.series_id = s.id and v.visibility = 'public' and v.status = 'ready'
      order by v.episode_number asc nulls last, v.published_at asc
      limit 1
    ) f on true
    where ${opts.where}
    order by ${opts.order}
    limit ${opts.limit}
  `);
  return (rows as unknown as Record<string, unknown>[]).map(toSeriesCard);
}

const hasEpisodes = sql`agg.episode_count > 0`;

/** A shelf of the drama home. */
export async function shelf(kind: Shelf, limit = 24): Promise<SeriesCard[]> {
  switch (kind) {
    case "popular":
      return seriesCards({ where: hasEpisodes, order: sql`agg.score desc, agg.total_views desc`, limit });
    case "new":
      return seriesCards({
        where: sql`${hasEpisodes} and agg.first_published > now() - make_interval(days => ${NEW_DAYS})`,
        order: sql`agg.first_published desc`,
        limit,
      });
    case "rankings":
      return seriesCards({ where: hasEpisodes, order: sql`agg.total_views desc, agg.score desc`, limit });
    case "coming":
      return seriesCards({ where: sql`s.premiere_at > now() and agg.episode_count = 0`, order: sql`s.premiere_at asc`, limit });
  }
}

/** The tropes at least one watchable series is tagged with, most used first. */
export async function usedTropes(): Promise<string[]> {
  const rows = (await db.execute(sql`
    select t.trope, count(*)::int as n
    from series s
    cross join lateral unnest(s.tropes) as t(trope)
    where exists (select 1 from videos v where v.series_id = s.id and v.visibility = 'public' and v.status = 'ready')
    group by t.trope
    order by n desc, t.trope
  `)) as unknown as { trope: string }[];
  return rows.map((row) => row.trope);
}

export async function seriesWithTrope(trope: Trope, limit = 48): Promise<SeriesCard[]> {
  return seriesCards({ where: sql`${hasEpisodes} and ${trope} = any(s.tropes)`, order: sql`agg.score desc`, limit });
}

/** A channel's shows, newest release first. */
export async function channelSeriesCards(channelId: string, limit = 48): Promise<SeriesCard[]> {
  return seriesCards({ where: sql`${hasEpisodes} and s.channel_id = ${channelId}`, order: sql`agg.latest_published desc`, limit });
}

export async function seriesCardsByIds(ids: string[]): Promise<Map<string, SeriesCard>> {
  if (ids.length === 0) return new Map();
  const list = await seriesCards({
    where: sql`s.id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`,
    order: sql`s.id`,
    limit: ids.length,
  });
  return new Map(list.map((card) => [card.id, card]));
}

export async function seriesCard(id: string): Promise<SeriesCard | null> {
  return (await seriesCardsByIds([id])).get(id) ?? null;
}

/* ---------------------------- My List --------------------------------- */

/** Saved series, last saved first. One with nothing out and nothing announced is left off. */
export async function myListCards(userId: string, limit = 100): Promise<SeriesCard[]> {
  return seriesCards({
    join: sql`join my_list ml on ml.series_id = s.id and ml.user_id = ${userId}`,
    where: sql`(agg.episode_count > 0 or s.premiere_at is not null)`,
    order: sql`ml.added_at desc`,
    limit,
  });
}

export async function inMyList(userId: string, seriesId: string): Promise<boolean> {
  const [row] = await db
    .select({ seriesId: myList.seriesId })
    .from(myList)
    .where(and(eq(myList.userId, userId), eq(myList.seriesId, seriesId)))
    .limit(1);
  return Boolean(row);
}

export async function setInMyList(userId: string, seriesId: string, saved: boolean) {
  if (saved) await db.insert(myList).values({ userId, seriesId }).onConflictDoNothing();
  else await db.delete(myList).where(and(eq(myList.userId, userId), eq(myList.seriesId, seriesId)));
}

/* ---------------------------- Continue watching ------------------------- */

export interface ContinueItem extends ContinuePoint {
  series: SeriesCard;
  watchedAt: Date;
}

/**
 * The series this viewer is part-way through, most recent first, each with
 * the episode to play next and where in it.
 */
export async function continueWatching(userId: string, limit = 12): Promise<ContinueItem[]> {
  const rows = (await db.execute(sql`
    select distinct on (v.series_id)
           v.series_id, v.id as video_id, v.episode_number, v.duration_sec,
           h.position_sec, h.completed_at, h.watched_at
    from watch_history h
    join videos v on v.id = h.video_id
    where h.user_id = ${userId} and v.series_id is not null and v.status = 'ready' and v.visibility <> 'private'
    order by v.series_id, h.watched_at desc
  `)) as unknown as Record<string, unknown>[];
  const recent = rows
    .map((row) => ({
      seriesId: String(row.series_id),
      last: {
        videoId: String(row.video_id),
        episodeNumber: row.episode_number === null ? null : Number(row.episode_number),
        positionSec: Number(row.position_sec ?? 0),
        durationSec: Number(row.duration_sec ?? 0),
        completed: row.completed_at !== null && row.completed_at !== undefined,
      },
      watchedAt: date(row.watched_at)!,
    }))
    .sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime())
    // Some will have nothing left to continue; look at a few more than are shown.
    .slice(0, limit * 2);
  if (recent.length === 0) return [];

  const ids = recent.map((item) => item.seriesId);
  const [cards, episodes] = await Promise.all([
    seriesCardsByIds(ids),
    db
      .select({ id: videos.id, seriesId: videos.seriesId, episodeNumber: videos.episodeNumber })
      .from(videos)
      .where(and(inArray(videos.seriesId, ids), listed))
      .orderBy(sql`${videos.episodeNumber} asc nulls last`, asc(videos.publishedAt)),
  ]);

  const items: ContinueItem[] = [];
  for (const item of recent) {
    const card = cards.get(item.seriesId);
    if (!card) continue;
    const point = continuePoint(
      item.last,
      episodes.filter((episode) => episode.seriesId === item.seriesId),
    );
    if (point) items.push({ ...point, series: card, watchedAt: item.watchedAt });
    if (items.length === limit) break;
  }
  return items;
}

/** Where this viewer is in one series, for its page's Play / Continue button. */
export async function continueInSeries(userId: string, seriesId: string): Promise<ContinueItem | null> {
  return (await continueWatching(userId, 50)).find((item) => item.series.id === seriesId) ?? null;
}
