import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { reactions, videos } from "@/db/schema";
import { EmptyState, viewsLabel } from "@/components/video-card";
import { VerticalFeed, type VerticalItem } from "@/components/vertical-feed";
import { formatCount } from "@/lib/format";
import { mediaUrl } from "@/lib/storage";
import { pageContext } from "@/lib/viewer";
import { issueViewTicket } from "@/lib/views";
import { paidEpisodes } from "@/lib/access";
import { listVertical } from "@/lib/videos";

export const metadata = { title: "Vertical" };

export default async function VerticalPage({ searchParams }: PageProps<"/vertical">) {
  const params = await searchParams;
  const lead = typeof params.v === "string" ? params.v : null;
  const { user, t, locale, fmt } = await pageContext();
  // Paid episodes stay out of the swipe feed, bought or not: it is the free
  // sampler, and a bought episode plays on its watch page, under its buyer's
  // watermark. Creators still see their own.
  const candidates = await listVertical({ leadId: lead, limit: 40 });
  const paid = await paidEpisodes(
    candidates.map((card) => ({ id: card.id, seriesId: card.seriesId, episodeNumber: card.episodeNumber, channelId: card.channel.id })),
  );
  const list = candidates.filter((card) => !paid.has(card.id) || card.channel.id === user?.id);
  if (list.length === 0) return <EmptyState title={t("vertical.empty")} />;

  const ids = list.map((video) => video.id);
  const [mine, counts] = await Promise.all([
    user
      ? db
          .select({ videoId: reactions.videoId, value: reactions.value })
          .from(reactions)
          .where(and(eq(reactions.userId, user.id), inArray(reactions.videoId, ids)))
      : Promise.resolve([]),
    db
      .select({ id: videos.id, likeCount: videos.likeCount, commentCount: videos.commentCount, videoKey: videos.videoKey })
      .from(videos)
      .where(inArray(videos.id, ids)),
  ]);
  const reactionBy = new Map(mine.map((row) => [row.videoId, row.value as -1 | 1]));
  const countBy = new Map(counts.map((row) => [row.id, row]));

  const items: VerticalItem[] = list.map((video) => {
    const extra = countBy.get(video.id)!;
    return {
      id: video.id,
      title: video.title,
      src: mediaUrl(extra.videoKey)!,
      poster: video.thumbnailUrl,
      channel: video.channel,
      views: viewsLabel(video.viewCount, fmt),
      likes: extra.likeCount,
      comments: formatCount(extra.commentCount, locale),
      models: video.aiModels.slice(0, 3),
      reaction: reactionBy.get(video.id) ?? 0,
      ticket: issueViewTicket(video.id),
      durationSec: video.durationSec,
    };
  });

  return <VerticalFeed items={items} signedIn={Boolean(user)} />;
}
