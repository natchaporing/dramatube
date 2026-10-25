import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { reports, users, videos } from "@/db/schema";
import { refundVideoUnlocks } from "./refunds";
import { mediaUrl } from "./storage";

/** The moderation queue: open reports grouped by video, most-reported first. */
export async function openReports() {
  const grouped = await db
    .select({
      videoId: reports.videoId,
      count: sql<number>`count(*)::int`,
      reasons: sql<string[]>`array_agg(distinct ${reports.reason})`,
      latest: sql<Date>`max(${reports.createdAt})`,
    })
    .from(reports)
    .where(isNull(reports.resolvedAt))
    .groupBy(reports.videoId)
    .orderBy(desc(sql`count(*)`), desc(sql`max(${reports.createdAt})`))
    .limit(100);
  if (grouped.length === 0) return [];
  const ids = grouped.map((row) => row.videoId);
  const [rows, details] = await Promise.all([
    db
      .select({ video: videos, channelName: users.name, channelHandle: users.handle })
      .from(videos)
      .innerJoin(users, eq(users.id, videos.channelId))
      .where(inArray(videos.id, ids)),
    db
      .select({ videoId: reports.videoId, details: reports.details })
      .from(reports)
      .where(and(isNull(reports.resolvedAt), inArray(reports.videoId, ids), sql`${reports.details} <> ''`))
      .orderBy(desc(reports.createdAt)),
  ]);
  const byId = new Map(rows.map((row) => [row.video.id, row]));
  return grouped.flatMap((group) => {
    const row = byId.get(group.videoId);
    if (!row) return [];
    return [
      {
        ...group,
        video: row.video,
        thumbnailUrl: mediaUrl(row.video.thumbnailKey),
        channelName: row.channelName,
        channelHandle: row.channelHandle,
        notes: details.filter((detail) => detail.videoId === group.videoId).map((detail) => detail.details).slice(0, 5),
      },
    ];
  });
}

export async function removedVideos() {
  return db
    .select({ id: videos.id, title: videos.title, removedReason: videos.removedReason, channelHandle: users.handle })
    .from(videos)
    .innerJoin(users, eq(users.id, videos.channelId))
    .where(eq(videos.status, "removed"))
    .orderBy(desc(videos.updatedAt))
    .limit(100);
}

export async function removeVideo(videoId: string, reason: string) {
  await db.transaction(async (tx) => {
    // Locked first, so no unlock can land between the refunds and the removal.
    const [video] = await tx.select({ id: videos.id }).from(videos).where(eq(videos.id, videoId)).for("update").limit(1);
    if (!video) return;
    // Everyone who paid for it gets their credits back.
    await refundVideoUnlocks(tx, videoId);
    await tx
      .update(videos)
      .set({ status: "removed", removedReason: reason.trim().slice(0, 300) || "Breaks the community rules", updatedAt: new Date() })
      .where(eq(videos.id, videoId));
    await tx
      .update(reports)
      .set({ resolvedAt: new Date(), resolution: "removed" })
      .where(and(eq(reports.videoId, videoId), isNull(reports.resolvedAt)));
  });
}

export async function dismissReports(videoId: string) {
  await db
    .update(reports)
    .set({ resolvedAt: new Date(), resolution: "dismissed" })
    .where(and(eq(reports.videoId, videoId), isNull(reports.resolvedAt)));
}

export async function restoreVideo(videoId: string) {
  await db.update(videos).set({ status: "ready", removedReason: null, updatedAt: new Date() }).where(eq(videos.id, videoId));
}
