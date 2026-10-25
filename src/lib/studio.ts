import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { series, users } from "@/db/schema";
import { LIMITS } from "./catalog";
import { handleProblem, normalizeHandle } from "./handles";
import { newId, newObjectName } from "./ids";
import { checkImage, type ImageInput } from "./publish";
import { deleteObject, putBuffer } from "./storage";

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
    if ((error as { code?: string }).code === "23505") throw new StudioError("handle_taken");
    throw error;
  }
  if (avatarKey !== user.avatarKey) await deleteObject(user.avatarKey).catch(() => {});
  if (bannerKey !== user.bannerKey) await deleteObject(user.bannerKey).catch(() => {});
  return { handle };
}
