import Link from "next/link";
import clsx from "clsx";
import { Lock } from "lucide-react";
import { Avatar } from "./avatar";
import { formatCount, formatDuration, isVertical, timeAgo } from "@/lib/format";
import type { Locale, Translate } from "@/lib/i18n";
import type { VideoCard as Card } from "@/lib/videos";

/**
 * The card, the row and the tall card. Rendered on the server with a
 * translator passed in, so "3 days ago" is computed once and the browser
 * never disagrees with it during hydration.
 */
export interface Fmt {
  t: Translate;
  locale: Locale;
}

export function viewsLabel(count: number, fmt: Fmt) {
  return count === 1 ? fmt.t("video.oneView") : fmt.t("video.views", { count: formatCount(count, fmt.locale) });
}

export function Thumbnail({
  video,
  fmt,
  className,
  showBadges = true,
}: {
  video: Card;
  fmt: Fmt;
  className?: string;
  showBadges?: boolean;
}) {
  const tall = isVertical(video.width, video.height);
  return (
    <div className={clsx("relative aspect-video overflow-hidden rounded-xl bg-raised", className)}>
      {video.thumbnailUrl ? (
        tall ? (
          <>
            {/* A tall picture in a wide frame: the picture itself, blurred, fills the bars. */}
            <img src={video.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-xl" />
            <img src={video.thumbnailUrl} alt="" className="relative mx-auto h-full object-contain" loading="lazy" />
          </>
        ) : (
          <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        )
      ) : (
        <Placeholder title={video.title} />
      )}
      {showBadges && (
        <>
          <span className="absolute left-1.5 top-1.5 flex gap-1">
            <span className="rounded bg-ai-dim/90 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-ai">AI</span>
            {video.episodeNumber !== null && (
              <span className="rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {fmt.t("video.episode", { number: video.episodeNumber })}
              </span>
            )}
          </span>
          {video.lockPrice !== undefined && (
            <span
              className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-warn"
              data-testid="lock-badge"
            >
              <Lock size={11} /> {video.lockPrice}
            </span>
          )}
          {video.durationSec > 0 && (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1 py-0.5 text-xs font-medium text-white">
              {formatDuration(video.durationSec)}
            </span>
          )}
          {video.positionSec !== undefined && video.durationSec > 0 && video.positionSec > 0 && (
            <span className="absolute inset-x-0 bottom-0 h-1 bg-white/30">
              <span
                className="block h-full bg-brand"
                style={{ width: `${Math.min(100, (video.positionSec / video.durationSec) * 100)}%` }}
              />
            </span>
          )}
        </>
      )}
    </div>
  );
}

/** For a video with no picture: its title on a gradient picked from its id. */
export function Placeholder({ title }: { title: string }) {
  let hash = 0;
  for (const char of title) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return (
    <div
      className="flex h-full w-full items-center justify-center p-4 text-center text-sm font-semibold text-white/90"
      style={{ background: `linear-gradient(135deg, oklch(0.35 0.12 ${hue}), oklch(0.25 0.1 ${(hue + 60) % 360}))` }}
    >
      <span className="line-clamp-3">{title}</span>
    </div>
  );
}

function StatusBadges({ video, fmt }: { video: Card; fmt: Fmt }) {
  if (video.status === "removed") {
    return <span className="rounded bg-bad-dim px-1.5 py-0.5 text-[11px] font-medium text-bad">{fmt.t("video.removed")}</span>;
  }
  if (video.visibility === "public") return null;
  return (
    <span className="rounded bg-raised px-1.5 py-0.5 text-[11px] font-medium text-muted">
      {fmt.t(video.visibility === "private" ? "video.private" : "video.unlisted")}
    </span>
  );
}

export function VideoCard({ video, fmt, hideChannel = false }: { video: Card; fmt: Fmt; hideChannel?: boolean }) {
  return (
    <div className="group min-w-0">
      <Link href={`/watch/${video.id}`} className="block">
        <Thumbnail video={video} fmt={fmt} className="transition-[border-radius] group-hover:rounded-md" />
      </Link>
      <div className="mt-3 flex gap-3">
        {!hideChannel && (
          <Link href={`/@${video.channel.handle}`} className="shrink-0">
            <Avatar name={video.channel.name} handle={video.channel.handle} url={video.channel.avatarUrl} size={36} />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <Link href={`/watch/${video.id}`}>
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-text">{video.title}</h3>
          </Link>
          {!hideChannel && (
            <Link href={`/@${video.channel.handle}`} className="mt-1 block truncate text-sm text-muted hover:text-text">
              {video.channel.name}
            </Link>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-sm text-muted">
            <span>{viewsLabel(video.viewCount, fmt)}</span>
            <span aria-hidden="true">·</span>
            <span>{timeAgo(video.publishedAt, fmt.locale)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <StatusBadges video={video} fmt={fmt} />
            {video.aiModels.slice(0, 2).map((model) => (
              <span key={model} className="rounded bg-ai-dim px-1.5 py-0.5 text-[11px] font-medium text-ai">
                {model}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function VideoGrid({ videos, fmt, hideChannel }: { videos: Card[]; fmt: Fmt; hideChannel?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} fmt={fmt} hideChannel={hideChannel} />
      ))}
    </div>
  );
}

/** A thumbnail beside its text: up next, search results, history. */
export function VideoRow({
  video,
  fmt,
  size = "sm",
  active = false,
}: {
  video: Card;
  fmt: Fmt;
  size?: "sm" | "lg";
  active?: boolean;
}) {
  return (
    <div className={clsx("group flex gap-2 rounded-lg", active && "bg-raised", size === "lg" ? "gap-4" : "")}>
      <Link
        href={`/watch/${video.id}`}
        className={clsx("shrink-0", size === "lg" ? "w-[44%] max-w-[360px] sm:w-[360px]" : "w-[168px]")}
      >
        <Thumbnail video={video} fmt={fmt} className={size === "lg" ? "" : "rounded-lg"} />
      </Link>
      <div className="min-w-0 flex-1 py-0.5">
        <Link href={`/watch/${video.id}`}>
          <h3 className={clsx("line-clamp-2 font-semibold leading-snug text-text", size === "lg" ? "text-base sm:text-lg" : "text-sm")}>
            {video.title}
          </h3>
        </Link>
        <div className={clsx("text-muted", size === "lg" ? "mt-1 text-xs sm:text-sm" : "mt-1 text-xs")}>
          {viewsLabel(video.viewCount, fmt)} · {timeAgo(video.publishedAt, fmt.locale)}
        </div>
        <Link
          href={`/@${video.channel.handle}`}
          className={clsx("flex items-center gap-2 text-muted hover:text-text", size === "lg" ? "my-2 text-xs sm:text-sm" : "mt-0.5 text-xs")}
        >
          {size === "lg" && <Avatar name={video.channel.name} handle={video.channel.handle} url={video.channel.avatarUrl} size={24} />}
          <span className="truncate">{video.channel.name}</span>
        </Link>
        <div className="mt-1 flex flex-wrap gap-1">
          <StatusBadges video={video} fmt={fmt} />
          {video.aiModels.slice(0, size === "lg" ? 4 : 1).map((model) => (
            <span key={model} className="rounded bg-ai-dim px-1.5 py-0.5 text-[10px] font-medium text-ai">
              {model}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The tall card on the vertical shelf. */
export function VerticalCard({ video, fmt }: { video: Card; fmt: Fmt }) {
  return (
    <Link href={`/vertical?v=${video.id}`} className="group block w-[180px] shrink-0 sm:w-[210px]">
      <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-raised">
        {video.thumbnailUrl ? (
          <img src={video.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <Placeholder title={video.title} />
        )}
        <span className="absolute left-1.5 top-1.5 rounded bg-ai-dim/90 px-1.5 py-0.5 text-[10px] font-semibold text-ai">AI</span>
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-text">{video.title}</h3>
      <div className="mt-0.5 text-xs text-muted">{viewsLabel(video.viewCount, fmt)}</div>
    </Link>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-raised text-3xl" aria-hidden="true">
        🎬
      </div>
      <p className="text-lg font-medium text-text">{title}</p>
      {hint && <p className="mt-1 max-w-md text-sm text-muted">{hint}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
