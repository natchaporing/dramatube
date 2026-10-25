import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { CalendarClock, Check, Lock, Play } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { MyListButton } from "@/components/my-list-button";
import { PosterArt, episodeTally, tropeLabel } from "@/components/series-poster";
import { EmptyState, VideoRow } from "@/components/video-card";
import { db } from "@/db";
import { watchHistory } from "@/db/schema";
import { continueInSeries, inMyList, seriesCard } from "@/lib/dramas";
import { formatCount, formatDate } from "@/lib/format";
import { tropeSlug } from "@/lib/tropes";
import { pageContext } from "@/lib/viewer";
import { seriesEpisodes, withLocks } from "@/lib/videos";

export async function generateMetadata({ params }: PageProps<"/series/[id]">): Promise<Metadata> {
  const card = await seriesCard((await params).id);
  if (!card) return { title: "Series" };
  const image = card.posterUrl ?? card.coverUrl;
  return {
    title: card.title,
    description: card.description.slice(0, 200) || undefined,
    openGraph: image ? { images: [image] } : undefined,
  };
}

/** Which of these episodes this viewer has watched to the end. */
async function finished(userId: string, videoIds: string[]): Promise<Set<string>> {
  if (videoIds.length === 0) return new Set();
  const rows = await db
    .select({ videoId: watchHistory.videoId })
    .from(watchHistory)
    .where(and(eq(watchHistory.userId, userId), inArray(watchHistory.videoId, videoIds), isNotNull(watchHistory.completedAt)));
  return new Set(rows.map((row) => row.videoId));
}

export default async function SeriesPage({ params }: PageProps<"/series/[id]">) {
  const { id } = await params;
  const { user, t, fmt } = await pageContext();
  const card = await seriesCard(id);
  if (!card) return <EmptyState title={t("common.notFound")} />;

  const own = user?.id === card.channel.id;
  // A stranger sees the public episodes; the owner sees every one, labelled.
  const episodes = await withLocks(user ?? null, await seriesEpisodes(id, own));
  const [resume, saved, watched] = await Promise.all([
    user ? continueInSeries(user.id, id) : Promise.resolve(null),
    user ? inMyList(user.id, id) : Promise.resolve(false),
    user ? finished(user.id, episodes.map((episode) => episode.id)) : Promise.resolve(new Set<string>()),
  ]);

  const first = episodes[0] ?? null;
  const play = resume
    ? { href: `/watch/${resume.videoId}`, label: t("series.continueAt", { number: resume.episodeNumber ?? 1 }) }
    : first
      ? { href: `/watch/${first.id}`, label: t("series.playFirst", { number: first.episodeNumber ?? 1 }) }
      : null;
  const coming = episodes.length === 0 && card.upcoming;
  const sells = episodes.some((episode) => episode.lockPrice !== undefined);
  const art = card.posterUrl ?? card.coverUrl;

  return (
    <div className="relative pb-12">
      {/* The poster, blurred, behind the top of the page: every show gets its own colour. */}
      {art && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden" aria-hidden="true">
          <img src={art} alt="" className="h-full w-full scale-110 object-cover opacity-30 blur-3xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-ground/30 via-ground/70 to-ground" />
        </div>
      )}
      <div className="relative mx-auto max-w-[1284px] px-4 pt-6 sm:px-6">
        <div className="flex gap-4 sm:gap-8">
          <div className="w-28 shrink-0 sm:w-48 lg:w-56">
            <PosterArt card={card} className="rounded-xl shadow-2xl" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <h1 className="text-xl font-bold leading-tight text-text sm:text-3xl">{card.title}</h1>
            <Link href={`/@${card.channel.handle}`} className="inline-flex items-center gap-2 text-sm font-medium text-text hover:underline">
              <Avatar name={card.channel.name} handle={card.channel.handle} url={card.channel.avatarUrl} size={24} />
              {card.channel.name}
            </Link>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span
                className={clsx(
                  "rounded px-1.5 py-0.5 text-xs font-semibold",
                  card.status === "completed" ? "bg-good/15 text-good" : "bg-ai-dim text-ai",
                )}
              >
                {t(card.status === "completed" ? "drama.completed" : "drama.ongoing")}
              </span>
              {episodes.length > 0 && <span>{episodeTally(card, fmt, episodes.length)}</span>}
              {card.totalViews > 0 && <span>{t("series.plays", { count: formatCount(card.totalViews, fmt.locale) })}</span>}
              {coming && (
                <span className="inline-flex items-center gap-1 text-ai">
                  <CalendarClock size={14} /> {t("series.premieres", { date: formatDate(card.premiereAt!, fmt.locale) })}
                </span>
              )}
            </div>
            {card.tropes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {card.tropes.map((trope) => (
                  <Link
                    key={trope}
                    href={`/dramas?trope=${tropeSlug(trope)}`}
                    className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:border-line-bright hover:text-text"
                  >
                    {tropeLabel(trope, fmt)}
                  </Link>
                ))}
              </div>
            )}
            {sells && (
              <p className="text-sm text-warn">{card.freeEpisodes === 1 ? t("series.freeOne") : t("series.freeUpTo", { count: card.freeEpisodes })}</p>
            )}
            {card.description && <p className="hidden max-w-3xl whitespace-pre-wrap text-sm text-muted sm:block">{card.description}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              {play && (
                <Link href={play.href} className="btn btn-primary" data-testid="series-play">
                  <Play size={16} className="fill-white" /> {play.label}
                </Link>
              )}
              <MyListButton seriesId={card.id} saved={saved} signedIn={Boolean(user)} next={`/series/${card.id}`} />
            </div>
          </div>
        </div>
        {card.description && <p className="mt-4 whitespace-pre-wrap text-sm text-muted sm:hidden">{card.description}</p>}

        {episodes.length === 0 ? (
          <div className="mt-8">
            <EmptyState title={t("series.empty")} />
          </div>
        ) : (
          <>
            <section className="mt-8">
              <h2 className="mb-3 text-lg font-bold text-text">{t("series.episodeGrid")}</h2>
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-10 lg:grid-cols-12" data-testid="episode-grid">
                {episodes.map((episode, index) => {
                  const current = resume?.videoId === episode.id;
                  const locked = episode.lockPrice !== undefined;
                  const done = watched.has(episode.id);
                  return (
                    <Link
                      key={episode.id}
                      href={`/watch/${episode.id}`}
                      title={episode.title}
                      data-locked={locked || undefined}
                      className={clsx(
                        "relative flex aspect-square items-center justify-center rounded-lg text-sm font-semibold transition-colors",
                        current ? "bg-brand text-white" : "bg-raised hover:bg-hover",
                        !current && (done ? "text-muted" : "text-text"),
                      )}
                    >
                      {episode.episodeNumber ?? index + 1}
                      {locked && <Lock size={11} className={clsx("absolute right-1 top-1", current ? "text-white" : "text-warn")} />}
                      {done && !locked && <Check size={11} className="absolute right-1 top-1 text-good" aria-label={t("series.watched")} />}
                    </Link>
                  );
                })}
              </div>
            </section>
            <section className="mt-8">
              <h2 className="mb-3 text-lg font-bold text-text">{t("series.allEpisodes")}</h2>
              <div className="space-y-3">
                {episodes.map((episode) => (
                  <VideoRow key={episode.id} video={episode} fmt={fmt} size="lg" active={resume?.videoId === episode.id} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
