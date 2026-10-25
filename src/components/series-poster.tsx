import Link from "next/link";
import clsx from "clsx";
import { ChevronRight, Play } from "lucide-react";
import { formatCount, formatDate } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import type { ContinueItem, SeriesCard } from "@/lib/dramas";
import { tropeSlug } from "@/lib/tropes";
import { Placeholder, type Fmt } from "./video-card";

/**
 * A series as a show: the tall poster every drama app shelves them as.
 *
 * Episodes come in every shape — 9:16, 16:9, square, 21:9 — and the poster
 * frame is always 2:3. A creator's own poster fills it. Without one the first
 * episode's picture stands in: a tall picture fills the frame, anything else
 * sits whole across the middle over a blurred copy of itself, so a wide
 * drama is never cropped to a sliver of someone's face.
 */

export function tropeLabel(trope: string, fmt: Pick<Fmt, "t">): string {
  return fmt.t(`trope.${tropeSlug(trope)}` as MessageKey);
}

type ArtSource = Pick<SeriesCard, "title" | "posterUrl" | "coverUrl" | "coverWidth" | "coverHeight">;

export function PosterArt({ card, className }: { card: ArtSource; className?: string }) {
  const tall = card.coverHeight >= card.coverWidth * 1.25;
  return (
    <div className={clsx("relative aspect-[2/3] overflow-hidden bg-raised", className)}>
      {card.posterUrl ? (
        <img src={card.posterUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : card.coverUrl ? (
        tall ? (
          <img src={card.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <>
            <img src={card.coverUrl} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-xl" loading="lazy" />
            <img src={card.coverUrl} alt="" className="absolute inset-x-0 top-1/2 w-full -translate-y-1/2 object-contain" loading="lazy" />
          </>
        )
      ) : (
        <Placeholder title={card.title} />
      )}
    </div>
  );
}

/** "EP 4" or, when the creator has said how many there will be, "EP 4 / 40". */
export function episodeTally(card: SeriesCard, fmt: Fmt, at = card.episodeCount): string {
  return card.plannedEpisodes && card.plannedEpisodes >= at
    ? fmt.t("drama.epOf", { number: at, total: card.plannedEpisodes })
    : fmt.t("drama.ep", { number: at });
}

function Badge({ card, fmt }: { card: SeriesCard; fmt: Fmt }) {
  if (card.upcoming) {
    return <span className="rounded bg-ai px-1.5 py-0.5 text-[10px] font-bold uppercase text-ground">{fmt.t("drama.soon")}</span>;
  }
  if (card.isNew) {
    return <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">{fmt.t("drama.new")}</span>;
  }
  if (card.status === "completed") {
    return <span className="rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">{fmt.t("drama.completed")}</span>;
  }
  return null;
}

export function SeriesPoster({
  card,
  fmt,
  rank,
  progress,
  className,
}: {
  card: SeriesCard;
  fmt: Fmt;
  /** On the rankings: the big number in the corner. */
  rank?: number;
  /** In Continue watching: where the viewer is. */
  progress?: ContinueItem;
  className?: string;
}) {
  return (
    <Link
      href={progress ? `/watch/${progress.videoId}` : `/series/${card.id}`}
      className={clsx("group block min-w-0", className)}
      data-testid="series-poster"
    >
      <div className="relative overflow-hidden rounded-xl">
        <PosterArt card={card} className="transition-transform duration-300 group-hover:scale-[1.03]" />
        <span className="absolute left-1.5 top-1.5">
          <Badge card={card} fmt={fmt} />
        </span>
        {rank !== undefined && (
          <span
            className={clsx(
              "absolute bottom-0 left-1 text-5xl font-black italic leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,.8)]",
              rank <= 3 ? "text-warn" : "text-white",
            )}
            aria-label={`#${rank}`}
          >
            {rank}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-6 text-right text-[11px] font-medium text-white">
          {progress ? (
            <span data-testid="continue-tally">{episodeTally(card, fmt, progress.episodeNumber ?? 1)}</span>
          ) : card.upcoming ? (
            <span>{formatDate(card.premiereAt!, fmt.locale)}</span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Play size={10} className="fill-white" />
              {formatCount(card.totalViews, fmt.locale)}
              <span className="text-white/60">·</span>
              {episodeTally(card, fmt)}
            </span>
          )}
        </div>
        {progress && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
            <span className="block h-full bg-brand" style={{ width: `${Math.max(4, progress.progress * 100)}%` }} />
          </span>
        )}
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-text">{card.title}</h3>
      {card.tropes.length > 0 && (
        <p className="mt-0.5 line-clamp-1 text-xs text-muted">{card.tropes.slice(0, 2).map((trope) => tropeLabel(trope, fmt)).join(" · ")}</p>
      )}
    </Link>
  );
}

/** A titled row of posters that scrolls sideways, with a "See all". */
export function PosterShelf({
  title,
  href,
  fmt,
  children,
  testId,
}: {
  title: React.ReactNode;
  href?: string;
  fmt: Fmt;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section data-testid={testId}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-text sm:text-xl">{title}</h2>
        {href && (
          <Link href={href} className="flex items-center text-sm font-medium text-muted hover:text-text">
            {fmt.t("home.seeAll")} <ChevronRight size={16} />
          </Link>
        )}
      </div>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">{children}</div>
    </section>
  );
}

/** The width a poster takes on a shelf. */
export const SHELF_POSTER = "w-[124px] shrink-0 sm:w-[150px] lg:w-[164px]";

export function PosterGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-8">{children}</div>;
}

/** What the Continue bar shows for a series in progress. */
export function continueBarProps(item: ContinueItem, fmt: Fmt) {
  return {
    href: `/watch/${item.videoId}`,
    title: item.series.title,
    tally: episodeTally(item.series, fmt, item.episodeNumber ?? 1),
    art: item.series.posterUrl ?? item.series.coverUrl,
    progress: item.progress,
    hideKey: item.videoId,
  };
}
