import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, reactions, reports, subscriptions, users, videos, views, watchHistory } from "@/db/schema";
import { LIMITS, type ReportReason } from "./catalog";
import { newId } from "./ids";
import { IP_DAILY_CAP } from "./views";
import { mediaUrl } from "./storage";

/**
 * Everything a viewer does to a video or a channel. Each counter on `videos`
 * or `users` moves in the same transaction as the row it counts, so the two
 * can never disagree.
 */

export async function reactionOf(userId: string, videoId: string): Promise<-1 | 0 | 1> {
  const [row] = await db
    .select({ value: reactions.value })
    .from(reactions)
    .where(and(eq(reactions.userId, userId), eq(reactions.videoId, videoId)))
    .limit(1);
  return (row?.value ?? 0) as -1 | 0 | 1;
}

/**
 * Set a reaction. Pressing the same button twice takes it back, as people
 * expect from a like button; the result is the state after the press.
 */
export async function setReaction(userId: string, videoId: string, pressed: 1 | -1) {
  return db.transaction(async (tx) => {
    const [video] = await tx.select({ id: videos.id }).from(videos).where(eq(videos.id, videoId)).for("update").limit(1);
    if (!video) throw new Error("NOT_FOUND");
    const [existing] = await tx
      .select({ value: reactions.value })
      .from(reactions)
      .where(and(eq(reactions.userId, userId), eq(reactions.videoId, videoId)))
      .limit(1);
    const before = (existing?.value ?? 0) as -1 | 0 | 1;
    const after: -1 | 0 | 1 = before === pressed ? 0 : pressed;

    if (after === 0) {
      await tx.delete(reactions).where(and(eq(reactions.userId, userId), eq(reactions.videoId, videoId)));
    } else if (before === 0) {
      await tx.insert(reactions).values({ userId, videoId, value: after });
    } else {
      await tx
        .update(reactions)
        .set({ value: after, createdAt: new Date() })
        .where(and(eq(reactions.userId, userId), eq(reactions.videoId, videoId)));
    }

    const likeDelta = (after === 1 ? 1 : 0) - (before === 1 ? 1 : 0);
    const dislikeDelta = (after === -1 ? 1 : 0) - (before === -1 ? 1 : 0);
    const [counts] = await tx
      .update(videos)
      .set({
        likeCount: sql`greatest(0, ${videos.likeCount} + ${likeDelta})`,
        dislikeCount: sql`greatest(0, ${videos.dislikeCount} + ${dislikeDelta})`,
      })
      .where(eq(videos.id, videoId))
      .returning({ likeCount: videos.likeCount, dislikeCount: videos.dislikeCount });
    return { value: after, ...counts };
  });
}

export async function isSubscribed(subscriberId: string, channelId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: subscriptions.channelId })
    .from(subscriptions)
    .where(and(eq(subscriptions.subscriberId, subscriberId), eq(subscriptions.channelId, channelId)))
    .limit(1);
  return Boolean(row);
}

export async function setSubscription(subscriberId: string, channelId: string, subscribe: boolean) {
  if (subscriberId === channelId) throw new Error("SELF_SUBSCRIBE");
  return db.transaction(async (tx) => {
    const [channel] = await tx.select({ id: users.id }).from(users).where(eq(users.id, channelId)).for("update").limit(1);
    if (!channel) throw new Error("NOT_FOUND");
    let delta = 0;
    if (subscribe) {
      const inserted = await tx
        .insert(subscriptions)
        .values({ subscriberId, channelId })
        .onConflictDoNothing()
        .returning({ id: subscriptions.channelId });
      delta = inserted.length;
    } else {
      const removed = await tx
        .delete(subscriptions)
        .where(and(eq(subscriptions.subscriberId, subscriberId), eq(subscriptions.channelId, channelId)))
        .returning({ id: subscriptions.channelId });
      delta = -removed.length;
    }
    const [row] = await tx
      .update(users)
      .set({ subscriberCount: sql`greatest(0, ${users.subscriberCount} + ${delta})` })
      .where(eq(users.id, channelId))
      .returning({ subscriberCount: users.subscriberCount });
    return { subscribed: subscribe, subscriberCount: row.subscriberCount };
  });
}

export interface CommentView {
  id: string;
  body: string;
  createdAt: Date;
  parentId: string | null;
  author: { id: string; handle: string; name: string; avatarUrl: string | null };
  replies: CommentView[];
}

/** Top-level comments newest first, each with its replies oldest first. */
export async function listComments(videoId: string, limit = 100): Promise<CommentView[]> {
  const select = {
    id: comments.id,
    body: comments.body,
    createdAt: comments.createdAt,
    parentId: comments.parentId,
    authorId: users.id,
    authorHandle: users.handle,
    authorName: users.name,
    authorAvatarKey: users.avatarKey,
  };
  const top = await db
    .select(select)
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(and(eq(comments.videoId, videoId), isNull(comments.parentId)))
    .orderBy(desc(comments.createdAt))
    .limit(limit);
  const ids = top.map((row) => row.id);
  const replies = ids.length
    ? await db
        .select(select)
        .from(comments)
        .innerJoin(users, eq(users.id, comments.userId))
        .where(inArray(comments.parentId, ids))
        .orderBy(asc(comments.createdAt))
    : [];
  const shape = (row: (typeof top)[number]): CommentView => ({
    id: row.id,
    body: row.body,
    createdAt: row.createdAt,
    parentId: row.parentId,
    author: { id: row.authorId, handle: row.authorHandle, name: row.authorName, avatarUrl: mediaUrl(row.authorAvatarKey) },
    replies: [],
  });
  const byId = new Map(top.map((row) => [row.id, shape(row)]));
  for (const reply of replies) byId.get(reply.parentId!)?.replies.push(shape(reply));
  return [...byId.values()];
}

export class CommentError extends Error {}

export async function addComment(userId: string, videoId: string, body: string, parentId?: string | null) {
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) throw new CommentError("empty");
  if (text.length > LIMITS.comment) throw new CommentError("too_long");
  return db.transaction(async (tx) => {
    if (parentId) {
      const [parent] = await tx
        .select({ videoId: comments.videoId, parentId: comments.parentId })
        .from(comments)
        .where(eq(comments.id, parentId))
        .limit(1);
      // Replies attach to a top-level comment of the same video, never deeper.
      if (!parent || parent.videoId !== videoId) throw new CommentError("bad_parent");
      if (parent.parentId) parentId = parent.parentId;
    }
    let row;
    try {
      [row] = await tx
        .insert(comments)
        .values({ id: newId("cmt"), videoId, userId, parentId: parentId ?? null, body: text })
        .returning();
    } catch (error) {
      // The comment being replied to was deleted a moment ago.
      if ((error as { code?: string }).code === "23503") throw new CommentError("bad_parent");
      throw error;
    }
    await tx
      .update(videos)
      .set({ commentCount: sql`${videos.commentCount} + 1` })
      .where(eq(videos.id, videoId));
    return row;
  });
}

/** Its author may delete a comment, and so may the owner of the video it is on. */
export async function deleteComment(actorId: string, commentId: string, actorIsAdmin = false) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: comments.id, userId: comments.userId, videoId: comments.videoId, ownerId: videos.channelId })
      .from(comments)
      .innerJoin(videos, eq(videos.id, comments.videoId))
      .where(eq(comments.id, commentId))
      .limit(1);
    if (!row) return false;
    if (row.userId !== actorId && row.ownerId !== actorId && !actorIsAdmin) throw new Error("FORBIDDEN");
    // Lock the comment, so no reply can be added to it (a reply's foreign
    // key needs a share lock on its parent) while its replies go, then count
    // what was actually deleted rather than what was there a moment earlier.
    const [locked] = await tx.select({ id: comments.id }).from(comments).where(eq(comments.id, commentId)).for("update");
    if (!locked) return false;
    const replies = await tx.delete(comments).where(eq(comments.parentId, commentId)).returning({ id: comments.id });
    const removed = await tx.delete(comments).where(eq(comments.id, commentId)).returning({ id: comments.id });
    const total = replies.length + removed.length;
    if (total > 0) {
      await tx
        .update(videos)
        .set({ commentCount: sql`greatest(0, ${videos.commentCount} - ${total})` })
        .where(eq(videos.id, row.videoId));
    }
    return true;
  });
}

/** Today in UTC, as the `views.day` key. */
export function viewDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Count a view, once per viewer per video per day, and for anonymous viewers
 * at most `IP_DAILY_CAP` times per network per video per day. Returns whether
 * this one counted. Signed-in viewers also get a history entry either way.
 */
export async function recordView(
  videoId: string,
  viewer: { key: string; userId: string | null; networkKey: string | null },
): Promise<boolean> {
  const day = viewDay();
  const counted = await db.transaction(async (tx) => {
    if (viewer.networkKey) {
      // Serialise the check-then-insert per video and network, so two
      // requests racing past the cap cannot both land.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${videoId}:${viewer.networkKey}`}))`);
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(views)
        .where(and(eq(views.videoId, videoId), eq(views.day, day), eq(views.networkKey, viewer.networkKey)));
      if (n >= IP_DAILY_CAP) return false;
    }
    const inserted = await tx
      .insert(views)
      .values({ videoId, viewerKey: viewer.key, day, networkKey: viewer.networkKey })
      .onConflictDoNothing()
      .returning({ videoId: views.videoId });
    if (inserted.length) {
      await tx
        .update(videos)
        .set({ viewCount: sql`${videos.viewCount} + 1` })
        .where(eq(videos.id, videoId));
    }
    return inserted.length > 0;
  });
  if (viewer.userId) await saveProgress(viewer.userId, videoId, null);
  return counted;
}

/**
 * Where a viewer is in a video. `ended` means they watched it to the end:
 * the position goes back to the start for the next visit, and the episode
 * counts as finished, so Continue watching moves on to the next one.
 */
export async function saveProgress(userId: string, videoId: string, positionSec: number | null, ended = false) {
  const position = positionSec === null || ended ? 0 : Math.max(0, Math.min(positionSec, 60 * 60 * 24));
  const now = new Date();
  await db
    .insert(watchHistory)
    .values({ userId, videoId, positionSec: position, watchedAt: now, completedAt: ended ? now : null })
    .onConflictDoUpdate({
      target: [watchHistory.userId, watchHistory.videoId],
      set:
        positionSec === null && !ended
          ? { watchedAt: now }
          : { positionSec: position, watchedAt: now, ...(ended ? { completedAt: now } : {}) },
    });
}

export async function resumePosition(userId: string, videoId: string): Promise<number> {
  const [row] = await db
    .select({ positionSec: watchHistory.positionSec })
    .from(watchHistory)
    .where(and(eq(watchHistory.userId, userId), eq(watchHistory.videoId, videoId)))
    .limit(1);
  return row?.positionSec ?? 0;
}

export async function clearHistory(userId: string) {
  await db.delete(watchHistory).where(eq(watchHistory.userId, userId));
}

export async function fileReport(opts: { videoId: string; reporterId: string | null; reason: ReportReason; details: string }) {
  const [row] = await db
    .insert(reports)
    .values({
      id: newId("rpt"),
      videoId: opts.videoId,
      reporterId: opts.reporterId,
      reason: opts.reason,
      details: opts.details.trim().slice(0, LIMITS.reportDetails),
    })
    .returning();
  return row;
}
