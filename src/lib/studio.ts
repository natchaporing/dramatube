import { and, eq, min, ne } from "drizzle-orm";
import { db } from "@/db";
import { uniqueViolation } from "@/db/errors";
import { sellers, series, users, videos } from "@/db/schema";
import { LIMITS } from "./catalog";
import {
  FREE_EPISODES_MAX,
  FREE_EPISODES_MIN,
  SERIES_PERCENT_MAX,
  SERIES_PERCENT_MIN,
  isEpisodePrice,
  isExclusive,
} from "./money";
import { handleProblem, normalizeHandle } from "./handles";
import { newId, newObjectName } from "./ids";
import { checkImage, type ImageInput } from "./publish";
import { deleteObject, putBuffer, videosArePrivate } from "./storage";

/** A creator's own things that are not videos: series and the channel itself. */

export class StudioError extends Error {}

export async function createSeries(channelId: string, title: string, description = "") {
  const name = title.trim().slice(0, LIMITS.seriesTitle);
  if (!name) throw new StudioError("title");
  const [row] = await db
    .insert(series)
    .values({ id: newId("ser"), channelId, title: name, description: description.trim().slice(0, LIMITS.description) })
    .returning();
  return row;
}

export async function updateSeries(channelId: string, seriesId: string, title: string, description: string) {
  const name = title.trim().slice(0, LIMITS.seriesTitle);
  if (!name) throw new StudioError("title");
  await db
    .update(series)
    .set({ title: name, description: description.trim().slice(0, LIMITS.description), updatedAt: new Date() })
    .where(and(eq(series.id, seriesId), eq(series.channelId, channelId)));
}

/** The episodes stay; they just stop belonging to a series (ON DELETE SET NULL). */
export async function deleteSeries(channelId: string, seriesId: string) {
  await db.delete(series).where(and(eq(series.id, seriesId), eq(series.channelId, channelId)));
}

export async function listOwnSeries(channelId: string) {
  return db.select({ id: series.id, title: series.title }).from(series).where(eq(series.channelId, channelId)).orderBy(series.title);
}

export async function updateChannel(
  userId: string,
  input: {
    name: string;
    handle: string;
    bio: string;
    avatar?: ImageInput | null;
    banner?: ImageInput | null;
    removeAvatar?: boolean;
    removeBanner?: boolean;
  },
) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new StudioError("not_found");

  const name = input.name.trim().slice(0, LIMITS.channelName);
  if (!name) throw new StudioError("name");
  const handle = normalizeHandle(input.handle);
  if (handle !== user.handle) {
    if (handleProblem(handle)) throw new StudioError("handle_invalid");
    const [taken] = await db.select({ id: users.id }).from(users).where(and(eq(users.handle, handle), ne(users.id, userId))).limit(1);
    if (taken) throw new StudioError("handle_taken");
  }

  const avatar = checkImage(input.avatar);
  const banner = checkImage(input.banner);
  let avatarKey = input.removeAvatar ? null : user.avatarKey;
  let bannerKey = input.removeBanner ? null : user.bannerKey;
  if (avatar) {
    avatarKey = `avatars/${userId}/${newObjectName()}.${avatar.ext}`;
    await putBuffer(avatarKey, avatar.data, avatar.type);
  }
  if (banner) {
    bannerKey = `banners/${userId}/${newObjectName()}.${banner.ext}`;
    await putBuffer(bannerKey, banner.data, banner.type);
  }

  try {
    await db
      .update(users)
      .set({ name, handle, bio: input.bio.trim().slice(0, LIMITS.bio), avatarKey, bannerKey })
      .where(eq(users.id, userId));
  } catch (error) {
    if (uniqueViolation(error) !== null) throw new StudioError("handle_taken");
    throw error;
  }
  if (avatarKey !== user.avatarKey) await deleteObject(user.avatarKey).catch(() => {});
  if (bannerKey !== user.bannerKey) await deleteObject(user.bannerKey).catch(() => {});
  return { handle };
}

export interface PricingInput {
  onSale: boolean;
  freeEpisodes: number;
  episodePrice: number;
  seriesPricePercent: number;
  exclusive: boolean;
}

/** When a series' first episode came out, which is when its exclusive window opens. */
async function firstPublished(seriesId: string): Promise<Date | null> {
  const [row] = await db.select({ at: min(videos.publishedAt) }).from(videos).where(eq(videos.seriesId, seriesId));
  return row?.at ? new Date(row.at) : null;
}

/**
 * What a series sells for. Only an approved seller can put a series on sale;
 * anyone can set the numbers ahead of approval.
 *
 * Exclusivity covers a series' first 90 days, counted from its first
 * episode (or from now, before there is one). It can be switched on any time
 * inside that window, cannot be switched off before the window ends, and
 * cannot be started again afterwards.
 */
export async function updateSeriesPricing(channelId: string, seriesId: string, input: PricingInput) {
  const [row] = await db
    .select({ exclusiveSince: series.exclusiveSince })
    .from(series)
    .where(and(eq(series.id, seriesId), eq(series.channelId, channelId)))
    .limit(1);
  if (!row) throw new StudioError("not_found");
  if (!isEpisodePrice(input.episodePrice)) throw new StudioError("price");
  const freeEpisodes = Math.round(input.freeEpisodes);
  if (!(freeEpisodes >= FREE_EPISODES_MIN && freeEpisodes <= FREE_EPISODES_MAX)) throw new StudioError("free");
  const percent = Math.round(input.seriesPricePercent);
  if (!(percent >= SERIES_PERCENT_MIN && percent <= SERIES_PERCENT_MAX)) throw new StudioError("percent");
  if (input.onSale) {
    const [seller] = await db.select({ status: sellers.status }).from(sellers).where(eq(sellers.userId, channelId)).limit(1);
    if (seller?.status !== "approved") throw new StudioError("not_seller");
    if (!videosArePrivate()) throw new StudioError("storage_public");
  }
  let exclusiveSince = row.exclusiveSince;
  if (input.exclusive && !exclusiveSince) {
    const start = (await firstPublished(seriesId)) ?? new Date();
    if (!isExclusive(start)) throw new StudioError("exclusive_closed");
    exclusiveSince = start;
  }
  await db
    .update(series)
    .set({ onSale: input.onSale, freeEpisodes, episodePrice: input.episodePrice, seriesPricePercent: percent, exclusiveSince, updatedAt: new Date() })
    .where(eq(series.id, seriesId));
}

/** Pricing for every series a channel owns, keyed by series id. */
export async function ownSeriesPricing(channelId: string) {
  const rows = await db
    .select({
      id: series.id,
      onSale: series.onSale,
      freeEpisodes: series.freeEpisodes,
      episodePrice: series.episodePrice,
      seriesPricePercent: series.seriesPricePercent,
      exclusiveSince: series.exclusiveSince,
      firstPublished: min(videos.publishedAt),
    })
    .from(series)
    .leftJoin(videos, eq(videos.seriesId, series.id))
    .where(eq(series.channelId, channelId))
    .groupBy(series.id);
  return new Map(
    rows.map(({ firstPublished: first, ...row }) => [
      row.id,
      // Whether exclusivity can still be switched on.
      { ...row, exclusiveOpen: !row.exclusiveSince && (!first || isExclusive(new Date(first))) },
    ]),
  );
}

