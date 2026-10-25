import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { sellers, series, unlocks, videos } from "@/db/schema";
import { isAdmin } from "./session";
import type { Viewer } from "./videos";

/**
 * Who may play which episode.
 *
 * An episode is for sale when its series is on sale, the series' creator is
 * an approved seller, and its number is past the series' free episodes. It is
 * locked for a viewer who is not its creator, not a moderator (who must be
 * able to review a reported episode without paying the creator reported),
 * and has not unlocked it. Episodes outside a series, or without a number,
 * are always free.
 *
 * The media route asks this before sending a byte of a locked episode, so the
 * paywall holds for anyone with the file's URL, not just for the play button.
 */

export interface Sale {
  seriesId: string;
  channelId: string;
  onSale: boolean;
  freeEpisodes: number;
  episodePrice: number;
  seriesPricePercent: number;
  exclusiveSince: Date | null;
  sellerApproved: boolean;
}

export function isPaidEpisode(sale: Sale | null | undefined, episodeNumber: number | null): boolean {
  return Boolean(sale && sale.onSale && sale.sellerApproved && episodeNumber !== null && episodeNumber > sale.freeEpisodes);
}

const saleColumns = {
  seriesId: series.id,
  channelId: series.channelId,
  onSale: series.onSale,
  freeEpisodes: series.freeEpisodes,
  episodePrice: series.episodePrice,
  seriesPricePercent: series.seriesPricePercent,
  exclusiveSince: series.exclusiveSince,
  sellerStatus: sellers.status,
};

function toSale(row: { sellerStatus: string | null } & Omit<Sale, "sellerApproved">): Sale {
  const { sellerStatus, ...rest } = row;
  return { ...rest, sellerApproved: sellerStatus === "approved" };
}

export async function salesFor(seriesIds: string[]): Promise<Map<string, Sale>> {
  const ids = [...new Set(seriesIds)];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select(saleColumns)
    .from(series)
    .leftJoin(sellers, eq(sellers.userId, series.channelId))
    .where(inArray(series.id, ids));
  return new Map(rows.map((row) => [row.seriesId, toSale(row)]));
}

export async function saleOf(seriesId: string): Promise<Sale | null> {
  return (await salesFor([seriesId])).get(seriesId) ?? null;
}

/**
 * The sale terms inside a buyer's transaction, with the series row
 * share-locked: a price change waits for the sale to commit, so what the
 * buyer was charged is what the series said when they bought.
 */
export async function lockSale(tx: Tx, seriesId: string): Promise<Sale | null> {
  const [row] = await tx
    .select(saleColumns)
    .from(series)
    .leftJoin(sellers, eq(sellers.userId, series.channelId))
    .where(eq(series.id, seriesId))
    .for("share", { of: series })
    .limit(1);
  return row ? toSale(row) : null;
}


export interface EpisodeLike {
  id: string;
  seriesId: string | null;
  episodeNumber: number | null;
  channelId: string;
}

/**
 * The episodes in a list that this viewer would have to pay for, with their
 * prices. Missing from the map means playable.
 */
export async function locksFor(viewer: Viewer, episodes: EpisodeLike[]): Promise<Map<string, number>> {
  if (viewer && isAdmin(viewer)) return new Map();
  const viewerId = viewer?.id ?? null;
  const candidates = episodes.filter((episode) => episode.seriesId && episode.channelId !== viewerId);
  if (candidates.length === 0) return new Map();
  const sales = await salesFor(candidates.map((episode) => episode.seriesId!));
  const paid = candidates.filter((episode) => isPaidEpisode(sales.get(episode.seriesId!), episode.episodeNumber));
  if (paid.length === 0) return new Map();
  const owned = viewerId
    ? new Set(
        (
          await db
            .select({ videoId: unlocks.videoId })
            .from(unlocks)
            .where(and(eq(unlocks.userId, viewerId), isNull(unlocks.refundedAt), inArray(unlocks.videoId, paid.map((episode) => episode.id))))
        ).map((row) => row.videoId),
      )
    : new Set<string>();
  return new Map(
    paid.filter((episode) => !owned.has(episode.id)).map((episode) => [episode.id, sales.get(episode.seriesId!)!.episodePrice]),
  );
}

/** Which episodes in a list are for sale at all, bought or not. */
export async function paidEpisodes(episodes: EpisodeLike[]): Promise<Set<string>> {
  const inSeries = episodes.filter((episode) => episode.seriesId);
  if (inSeries.length === 0) return new Set();
  const sales = await salesFor(inSeries.map((episode) => episode.seriesId!));
  return new Set(inSeries.filter((episode) => isPaidEpisode(sales.get(episode.seriesId!), episode.episodeNumber)).map((episode) => episode.id));
}

export interface EpisodeLock {
  locked: boolean;
  price: number;
  sale: Sale | null;
}

/** One episode, for the watch page and the media route. */
export async function lockFor(viewer: Viewer, videoId: string): Promise<EpisodeLock> {
  const [video] = await db
    .select({ id: videos.id, seriesId: videos.seriesId, episodeNumber: videos.episodeNumber, channelId: videos.channelId })
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);
  if (!video?.seriesId) return { locked: false, price: 0, sale: null };
  const sale = await saleOf(video.seriesId);
  if (!isPaidEpisode(sale, video.episodeNumber) || video.channelId === viewer?.id) return { locked: false, price: 0, sale };
  const prices = await locksFor(viewer, [video]);
  return { locked: prices.has(video.id), price: sale!.episodePrice, sale };
}
