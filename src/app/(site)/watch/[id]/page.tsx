import type { Metadata } from "next";
import Link from "next/link";
import { ListVideo, ShieldAlert } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { EmptyState, VideoRow, viewsLabel } from "@/components/video-card";
import { EditLink, Reactions, ReportButton, ShareButton, SubscribeButton } from "@/components/watch/actions";
import { Comments, type CommentItem } from "@/components/watch/comments";
import { AutoplayToggle, DescriptionBox } from "@/components/watch/details";
import { Player } from "@/components/watch/player";
import { isCategory } from "@/lib/catalog";
import { formatCount, formatDate, timeAgo } from "@/lib/format";
import { mediaUrl } from "@/lib/storage";
import { listComments, isSubscribed, reactionOf, resumePosition, type CommentView } from "@/lib/social";
import { pageContext } from "@/lib/viewer";
import { getWatchable, seriesEpisodes, upNext, withLocks } from "@/lib/videos";
import { currentUser } from "@/lib/auth";
import { issueViewTicket } from "@/lib/views";
import { Paywall } from "@/components/watch/paywall";
import { lockFor } from "@/lib/access";
import { restOfSeries } from "@/lib/unlock";
import { balanceOf } from "@/lib/wallet";

export async function generateMetadata({ params }: PageProps<"/watch/[id]">): Promise<Metadata> {
  const { id } = await params;
  const video = await getWatchable(id, await currentUser());
  if (!video) return { title: "Video unavailable" };
  const description = video.description.slice(0, 200) || `${video.channel.name} on DramaTube`;
  const listedPublicly = video.visibility === "public" && video.status === "ready";
  return {
    title: video.title,
    description,
    robots: listedPublicly ? undefined : { index: false },
    openGraph: {
      type: "video.other",
      title: video.title,
      description,
      images: video.thumbnailUrl ? [{ url: video.thumbnailUrl }] : undefined,
    },
  };
}

export default async function WatchPage({ params, searchParams }: PageProps<"/watch/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const { user, admin, t, locale, fmt } = await pageContext();
  const video = await getWatchable(id, user);

  if (!video) {
    return (
      <EmptyState
        title={t("watch.notFound")}
        hint={t("watch.notFoundHint")}
        action={
          <Link href="/" className="btn btn-ghost">
            {t("common.goHome")}
          </Link>
        }
      />
    );
  }

  const own = user?.id === video.channelId;
  const [next, comments, reaction, subscribed, resume, rawEpisodes, lock] = await Promise.all([
    upNext(video),
    listComments(video.id),
    user ? reactionOf(user.id, video.id) : Promise.resolve(0 as const),
    user && !own ? isSubscribed(user.id, video.channelId) : Promise.resolve(false),
    user ? resumePosition(user.id, video.id) : Promise.resolve(0),
    video.seriesId ? seriesEpisodes(video.seriesId, own) : Promise.resolve([]),
    lockFor(user ?? null, video.id),
  ]);
  const [episodes, upNextItems] = await Promise.all([withLocks(user ?? null, rawEpisodes), withLocks(user ?? null, next.items)]);
  const [rest, balance] =
    lock.locked && video.seriesId
      ? await Promise.all([restOfSeries(user?.id ?? null, video.seriesId), user ? balanceOf(user.id) : Promise.resolve(null)])
      : [null, null];

  const requestedStart = Number(query.t);
  const startAt = Number.isFinite(requestedStart) && requestedStart > 0 ? requestedStart : resume > 10 ? resume : 0;

  const shapeComment = (comment: CommentView): CommentItem => ({
    id: comment.id,
    body: comment.body,
    ago: timeAgo(comment.createdAt, locale),
    author: comment.author,
    replies: comment.replies.map(shapeComment),
  });

  const me = user ? { id: user.id, name: user.name, handle: user.handle, avatarUrl: mediaUrl(user.avatarKey) } : null;
  const stats = `${viewsLabel(video.viewCount, fmt)} · ${formatDate(video.publishedAt, locale)}`;
  const nextUp = next.nextEpisode ?? next.items[0] ?? null;

  return (
    <div className="mx-auto grid max-w-[1760px] grid-cols-1 gap-x-6 gap-y-6 pb-12 sm:px-6 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_402px] lg:grid-rows-[auto_1fr]">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        {lock.locked && video.seriesId && lock.sale ? (
          <Paywall
            videoId={video.id}
            seriesId={video.seriesId}
            episodeNumber={video.episodeNumber ?? 0}
            freeEpisodes={lock.sale.freeEpisodes}
            price={lock.price}
            rest={rest ? { ids: rest.remaining.map((episode) => episode.id), total: rest.total, fullPrice: rest.fullPrice } : null}
            balance={balance ? balance.total : null}
            poster={video.thumbnailUrl}
            width={video.width}
            height={video.height}
            here={`/watch/${video.id}`}
          />
        ) : (
          <Player
            videoId={video.id}
            src={video.videoUrl}
            poster={video.thumbnailUrl}
            width={video.width}
            height={video.height}
            durationSec={video.durationSec}
            startAt={startAt}
            signedIn={Boolean(user)}
            next={nextUp ? { id: nextUp.id, title: nextUp.title } : null}
            countable={video.status === "ready" && !own}
            viewTicket={issueViewTicket(video.id)}
          />
        )}

        <div className="px-4 sm:px-0">
          {video.status === "removed" && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-bad-dim px-4 py-3 text-sm text-bad">
              <ShieldAlert size={18} className="mt-0.5 shrink-0" />
              {t("watch.removedNotice", { reason: video.removedReason ?? "—" })}
            </div>
          )}
          {video.status === "ready" && video.visibility !== "public" && own && (
            <div className="mt-4 rounded-lg bg-raised px-4 py-3 text-sm text-muted">
              {t(video.visibility === "private" ? "watch.privateNotice" : "watch.unlistedNotice")}
            </div>
          )}

          {video.seriesId && video.seriesTitle && (
            <Link href={`/series/${video.seriesId}`} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#8ab4ff] hover:underline">
              <ListVideo size={16} />
              {video.seriesTitle}
              {video.episodeNumber !== null && <span className="text-muted">· {t("video.episode", { number: video.episodeNumber })}</span>}
            </Link>
          )}
          <h1 className="mt-3 text-xl font-bold leading-snug text-text">{video.title}</h1>

          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Link href={`/@${video.channel.handle}`} className="shrink-0">
                <Avatar name={video.channel.name} handle={video.channel.handle} url={video.channel.avatarUrl} size={40} />
              </Link>
              <div className="mr-3 min-w-0">
                <Link href={`/@${video.channel.handle}`} className="block truncate font-semibold text-text">
                  {video.channel.name}
                </Link>
                <div className="text-xs text-muted">
                  {video.channel.subscriberCount === 1
                    ? t("watch.oneSubscriber")
                    : t("watch.subscribers", { count: formatCount(video.channel.subscriberCount, locale) })}
                </div>
              </div>
              {own ? (
                <EditLink videoId={video.id} />
              ) : (
                <SubscribeButton
                  channelId={video.channelId}
                  initial={subscribed}
                  initialCount={video.channel.subscriberCount}
                  signedIn={Boolean(user)}
                  own={own}
                />
              )}
            </div>
            <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
              <Reactions videoId={video.id} initial={reaction} likes={video.likeCount} signedIn={Boolean(user)} />
              <ShareButton
                videoId={video.id}
                embeddable={video.visibility !== "private" && video.status === "ready"}
                refHandle={own ? video.channel.handle : undefined}
              />
              {!own && <ReportButton videoId={video.id} signedIn={Boolean(user)} />}
            </div>
          </div>

          <div className="mt-4">
            <DescriptionBox
              stats={stats}
              description={video.description}
              tags={video.tags}
              category={video.category}
              categoryLabel={isCategory(video.category) ? t(`category.${video.category}`) : video.category}
              aiUsage={video.aiUsage}
              aiModels={video.aiModels}
              prompt={video.prompt}
              sourceApp={video.sourceApp}
            />
          </div>

        </div>
      </div>

      <aside className="min-w-0 px-4 sm:px-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        {episodes.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-xl border border-line">
            <div className="bg-surface px-4 py-3">
              <Link href={`/series/${video.seriesId}`} className="font-semibold text-text hover:underline">
                {video.seriesTitle}
              </Link>
              <div className="text-xs text-muted">
                {t("watch.ofSeries", { title: video.channel.name, count: episodes.length })}
              </div>
            </div>
            <div className="max-h-[360px] space-y-1 overflow-y-auto p-2">
              {episodes.map((episode) => (
                <VideoRow key={episode.id} video={episode} fmt={fmt} active={episode.id === video.id} />
              ))}
            </div>
          </div>
        )}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-text">{t("watch.upNext")}</h2>
          <AutoplayToggle />
        </div>
        <div className="space-y-2">
          {upNextItems.map((item) => (
            <VideoRow key={item.id} video={item} fmt={fmt} />
          ))}
        </div>
      </aside>

      {/* One comments section: beside the up-next column on a wide screen, under it on a phone. */}
      <div className="min-w-0 px-4 sm:px-0 lg:col-start-1 lg:row-start-2">
        <Comments
          videoId={video.id}
          ownerId={video.channelId}
          count={video.commentCount}
          comments={comments.map(shapeComment)}
          me={me}
          canModerate={admin}
        />
      </div>
    </div>
  );
}
