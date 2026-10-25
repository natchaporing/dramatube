import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { Avatar } from "@/components/avatar";
import { SeriesCard } from "@/components/series-card";
import { EmptyState, VideoGrid } from "@/components/video-card";
import { SubscribeButton } from "@/components/watch/actions";
import { RichText } from "@/components/watch/rich-text";
import { formatCount, formatDate } from "@/lib/format";
import { normalizeHandle } from "@/lib/handles";
import { isSubscribed } from "@/lib/social";
import { mediaUrl } from "@/lib/storage";
import { pageContext } from "@/lib/viewer";
import { channelByHandle, channelStats, listChannelVideos, listPublicCount, listSeries, withLocks } from "@/lib/videos";

const TABS = ["videos", "series", "about"] as const;
type Tab = (typeof TABS)[number];

function handleFrom(raw: string) {
  return normalizeHandle(decodeURIComponent(raw));
}

export async function generateMetadata({ params }: PageProps<"/c/[handle]">): Promise<Metadata> {
  const channel = await channelByHandle(handleFrom((await params).handle));
  if (!channel) return { title: "Channel not found" };
  return {
    title: `${channel.name} (@${channel.handle})`,
    description: channel.bio.slice(0, 200) || undefined,
    openGraph: { images: channel.avatarKey ? [{ url: mediaUrl(channel.avatarKey)! }] : undefined },
  };
}

export default async function ChannelPage({ params, searchParams }: PageProps<"/c/[handle]">) {
  const handle = handleFrom((await params).handle);
  const query = await searchParams;
  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : "videos";
  const sort = query.sort === "popular" ? "popular" : "latest";
  const { user, t, locale, fmt } = await pageContext();
  const channel = await channelByHandle(handle);
  if (!channel) {
    return <EmptyState title={t("channel.notFound")} action={<Link href="/" className="btn btn-ghost">{t("common.goHome")}</Link>} />;
  }

  const own = user?.id === channel.id;
  const [videoCount, subscribed, stats, videos, seriesList] = await Promise.all([
    listPublicCount(channel.id),
    user && !own ? isSubscribed(user.id, channel.id) : Promise.resolve(false),
    tab === "about" ? channelStats(channel.id, true) : Promise.resolve(null),
    tab === "videos" ? listChannelVideos(channel.id, { includeHidden: false, sort }).then((list) => withLocks(user, list)) : Promise.resolve([]),
    tab === "series" ? listSeries(channel.id) : Promise.resolve([]),
  ]);

  const banner = mediaUrl(channel.bannerKey);
  const tabLink = (next: Tab) => (next === "videos" ? `/@${channel.handle}` : `/@${channel.handle}?tab=${next}`);

  return (
    <div className="mx-auto max-w-[1284px] px-4 pb-12 sm:px-6">
      <div className="pt-4">
        <div
          className="aspect-[6/1] min-h-24 overflow-hidden rounded-xl bg-raised"
          style={
            banner
              ? undefined
              : { background: "linear-gradient(120deg, color-mix(in srgb, #ff4f6d 35%, #16161b), color-mix(in srgb, #9b7bff 35%, #16161b))" }
          }
        >
          {banner && <img src={banner} alt="" className="h-full w-full object-cover" />}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Two sizes, each in its own wrapper: the fallback avatar carries its own display class. */}
        <span className="hidden sm:block">
          <Avatar name={channel.name} handle={channel.handle} url={mediaUrl(channel.avatarKey)} size={120} />
        </span>
        <span className="sm:hidden">
          <Avatar name={channel.name} handle={channel.handle} url={mediaUrl(channel.avatarKey)} size={72} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-text sm:text-4xl">{channel.name}</h1>
          <div className="mt-1 flex flex-wrap gap-x-1.5 text-sm text-muted">
            <span className="font-medium text-text">@{channel.handle}</span>
            <span>·</span>
            <span>
              {channel.subscriberCount === 1
                ? t("watch.oneSubscriber")
                : t("watch.subscribers", { count: formatCount(channel.subscriberCount, locale) })}
            </span>
            <span>·</span>
            <span>{videoCount === 1 ? t("channel.oneVideo") : t("channel.videoCount", { count: formatCount(videoCount, locale) })}</span>
          </div>
          {channel.bio && (
            <Link href={tabLink("about")} className="mt-2 line-clamp-1 block max-w-2xl text-sm text-muted hover:text-text">
              {channel.bio}
            </Link>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {own ? (
              <>
                <Link href="/studio/channel" className="btn btn-ghost h-9">
                  {t("channel.customize")}
                </Link>
                <Link href="/studio" className="btn btn-ghost h-9">
                  {t("channel.manage")}
                </Link>
              </>
            ) : (
              <SubscribeButton
                channelId={channel.id}
                initial={subscribed}
                initialCount={channel.subscriberCount}
                signedIn={Boolean(user)}
                own={own}
              />
            )}
          </div>
        </div>
      </div>

      <nav className="mt-6 flex gap-6 border-b border-line">
        {TABS.map((name) => (
          <Link
            key={name}
            href={tabLink(name)}
            className={clsx(
              "-mb-px border-b-2 pb-3 text-sm font-medium",
              tab === name ? "border-text text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t(`channel.${name}`)}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "videos" &&
          (videos.length === 0 ? (
            <EmptyState title={t("channel.empty")} />
          ) : (
            <>
              <div className="mb-5 flex gap-2">
                {(["latest", "popular"] as const).map((value) => (
                  <Link
                    key={value}
                    href={value === "latest" ? tabLink("videos") : `/@${channel.handle}?sort=popular`}
                    className={clsx("chip", sort === value ? "bg-text text-ground" : "bg-raised text-text hover:bg-hover")}
                  >
                    {t(value === "latest" ? "sort.latest" : "sort.popular")}
                  </Link>
                ))}
              </div>
              <VideoGrid videos={videos} fmt={fmt} hideChannel />
            </>
          ))}

        {tab === "series" &&
          (seriesList.length === 0 ? (
            <EmptyState title={t("channel.noSeries")} />
          ) : (
            <div className="grid grid-cols-1 gap-x-4 gap-y-10 pt-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {seriesList.map((item) => (
                <SeriesCard key={item.id} item={item} fmt={fmt} />
              ))}
            </div>
          ))}

        {tab === "about" && stats && (
          <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text">
              {channel.bio ? <RichText text={channel.bio} seekable={false} /> : <span className="text-muted">{t("channel.noBio")}</span>}
            </div>
            <dl className="space-y-3 border-t border-line pt-4 text-sm text-muted lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <div>{t("channel.joined", { date: formatDate(channel.createdAt, locale) })}</div>
              <div>{t("channel.totalViews", { count: formatCount(stats.views, locale) })}</div>
              <div>{videoCount === 1 ? t("channel.oneVideo") : t("channel.videoCount", { count: videoCount })}</div>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
