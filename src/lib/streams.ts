import { createHash } from "node:crypto";
import { and, count, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { playbackSessions } from "@/db/schema";
import { MAX_STREAMS } from "./stream-limit";

/**
 * How many browsers one account may stream paid episodes on at once — what
 * stops one purchase becoming a whole group chat's. Netflix's idea, kept
 * simple: a browser is "streaming" for a few minutes after it last fetched a
 * paid file, and a third browser has to take over from the other two.
 *
 * A browser is its sign-in: the session cookie is issued once per sign-in
 * and never rotated, so its hash names that browser without a cookie of its
 * own (which would race with the video's first requests).
 */

export { MAX_STREAMS };
/** A browser counts as streaming for this long after its last request for a paid file. */
const ACTIVE_MS = 3 * 60_000;
/** Seen-at is refreshed at most this often: a playback is dozens of Range requests, not dozens of writes. */
const TOUCH_MS = 30_000;

export function deviceKey(sessionToken: string): string {
  return createHash("sha256").update(`dramatube:device:${sessionToken}`).digest("hex").slice(0, 32);
}

export type StreamClaim = { ok: true } | { ok: false; active: number };

/** Whether this browser may stream a paid file now; records that it is. */
export async function claimStream(userId: string, device: string, now = new Date()): Promise<StreamClaim> {
  const since = new Date(now.getTime() - ACTIVE_MS);
  const [mine] = await db
    .select({ lastSeen: playbackSessions.lastSeen })
    .from(playbackSessions)
    .where(and(eq(playbackSessions.userId, userId), eq(playbackSessions.deviceKey, device), gt(playbackSessions.lastSeen, since)))
    .limit(1);
  if (mine) {
    if (now.getTime() - mine.lastSeen.getTime() > TOUCH_MS) {
      await db
        .update(playbackSessions)
        .set({ lastSeen: now })
        .where(and(eq(playbackSessions.userId, userId), eq(playbackSessions.deviceKey, device)));
    }
    return { ok: true };
  }
  // A browser joining: decided under a per-account lock, so two starting at
  // the same moment cannot both take the last place.
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`streams:${userId}`}))`);
    const [{ others }] = await tx
      .select({ others: count() })
      .from(playbackSessions)
      .where(and(eq(playbackSessions.userId, userId), ne(playbackSessions.deviceKey, device), gt(playbackSessions.lastSeen, since)));
    if (others >= MAX_STREAMS) return { ok: false as const, active: others };
    await tx
      .insert(playbackSessions)
      .values({ userId, deviceKey: device, lastSeen: now })
      .onConflictDoUpdate({ target: [playbackSessions.userId, playbackSessions.deviceKey], set: { lastSeen: now } });
    return { ok: true as const };
  });
}

/** "Watch here instead": every other browser on the account stops counting, and this one starts. */
export async function takeOverStreams(userId: string, device: string, now = new Date()) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`streams:${userId}`}))`);
    await tx.delete(playbackSessions).where(and(eq(playbackSessions.userId, userId), ne(playbackSessions.deviceKey, device)));
    await tx
      .insert(playbackSessions)
      .values({ userId, deviceKey: device, lastSeen: now })
      .onConflictDoUpdate({ target: [playbackSessions.userId, playbackSessions.deviceKey], set: { lastSeen: now } });
  });
}
