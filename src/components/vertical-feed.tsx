"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, MessageSquare, Volume2, VolumeX } from "lucide-react";
import { Avatar } from "./avatar";
import { useT } from "./i18n";
import { Reactions } from "./watch/actions";
import { postView } from "./watch/player";
import type { ChannelRef } from "@/lib/videos";

export interface VerticalItem {
  id: string;
  title: string;
  src: string;
  poster: string | null;
  channel: ChannelRef;
  views: string;
  likes: number;
  comments: string;
  models: string[];
  reaction: -1 | 0 | 1;
  ticket: string;
  durationSec: number;
}

/**
 * One tall video per screen, snapping, the one in view playing and the rest
 * paused. Sound starts off — browsers refuse to autoplay with it — and one
 * tap turns it on for the whole feed rather than per clip.
 */
export function VerticalFeed({ items, signedIn }: { items: VerticalItem[]; signedIn: boolean }) {
  const t = useT();
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const container = useRef<HTMLDivElement>(null);
  const videos = useRef<Array<HTMLVideoElement | null>>([]);
  const counted = useRef(new Set<string>());

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-index]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [items.length]);

  useEffect(() => {
    videos.current.forEach((video, index) => {
      if (!video) return;
      if (index === active) {
        video.muted = muted;
        void video.play().catch(() => {
          // Autoplay refused (some browsers, even muted): leave it on the poster.
        });
      } else {
        video.pause();
      }
    });
    const item = items[active];
    if (item) window.history.replaceState(null, "", `/vertical?v=${item.id}`);
  }, [active, muted, items]);

  const scrollTo = useCallback((index: number) => {
    const root = container.current;
    const target = root?.querySelector(`[data-index="${index}"]`);
    target?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("input, textarea")) return;
      if (event.key === "ArrowDown" || event.key === "j") scrollTo(Math.min(items.length - 1, active + 1));
      if (event.key === "ArrowUp" || event.key === "k") scrollTo(Math.max(0, active - 1));
      if (event.key === "m") setMuted((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, items.length, scrollTo]);

  const onTime = (item: VerticalItem, video: HTMLVideoElement) => {
    if (counted.current.has(item.id)) return;
    const threshold = Math.min(10, Math.max(2, (video.duration || item.durationSec || 0) * 0.3));
    if (video.currentTime >= threshold) {
      counted.current.add(item.id);
      void postView(item.id, item.ticket);
    }
  };

  return (
    <div ref={container} className="no-scrollbar h-[calc(100dvh-3.5rem)] snap-y snap-mandatory overflow-y-scroll">
      {items.map((item, index) => (
        <section key={item.id} data-index={index} className="flex h-full snap-start snap-always items-center justify-center gap-4 py-2 sm:py-4">
          <div className="relative aspect-[9/16] h-full max-w-full overflow-hidden bg-black sm:rounded-2xl">
            <video
              ref={(node) => {
                videos.current[index] = node;
              }}
              src={Math.abs(index - active) <= 1 ? item.src : undefined}
              poster={item.poster ?? undefined}
              loop
              playsInline
              muted={muted}
              preload={index === active ? "auto" : "metadata"}
              className="h-full w-full object-cover"
              onClick={() => setMuted((value) => !value)}
              onTimeUpdate={(event) => onTime(item, event.currentTarget)}
            />
            <button
              className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white"
              onClick={() => setMuted((value) => !value)}
              aria-label={muted ? t("vertical.unmute") : t("vertical.mute")}
            >
              {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            {muted && index === active && (
              <button
                className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white"
                onClick={() => setMuted(false)}
              >
                {t("vertical.unmute")}
              </button>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pr-16 pt-16 sm:pr-4">
              <Link href={`/@${item.channel.handle}`} className="pointer-events-auto flex items-center gap-2 text-sm font-semibold text-white">
                <Avatar name={item.channel.name} handle={item.channel.handle} url={item.channel.avatarUrl} size={32} />@{item.channel.handle}
              </Link>
              <Link href={`/watch/${item.id}`} className="pointer-events-auto mt-2 line-clamp-2 block text-[15px] font-medium text-white">
                {item.title}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-white/80">
                <span>{item.views}</span>
                {item.models.map((model) => (
                  <span key={model} className="rounded bg-ai-dim/90 px-1.5 py-0.5 font-medium text-ai">
                    {model}
                  </span>
                ))}
              </div>
            </div>
            {/* On a phone the actions float over the picture; on a wide screen they sit beside it. */}
            <div className="absolute bottom-24 right-2 flex flex-col items-center gap-4 sm:hidden">
              <RailActions item={item} signedIn={signedIn} />
            </div>
          </div>
          <div className="hidden flex-col items-center gap-4 self-end pb-6 sm:flex">
            <RailActions item={item} signedIn={signedIn} />
          </div>
        </section>
      ))}
    </div>
  );
}

function RailActions({ item, signedIn }: { item: VerticalItem; signedIn: boolean }) {
  const t = useT();
  return (
    <>
      <Reactions videoId={item.id} initial={item.reaction} likes={item.likes} signedIn={signedIn} variant="rail" />
      <Link
        href={`/watch/${item.id}#comments`}
        className="flex flex-col items-center gap-1 text-xs text-white"
        aria-label={t("vertical.comments")}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-raised">
          <MessageSquare size={20} />
        </span>
        {item.comments}
      </Link>
      <Link
        href={`/watch/${item.id}`}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-raised text-white"
        aria-label={t("vertical.openFull")}
      >
        <ExternalLink size={20} />
      </Link>
    </>
  );
}
