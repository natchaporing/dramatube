"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import clsx from "clsx";
import { formatDuration, isVertical } from "@/lib/format";
import { useT } from "../i18n";

export const SEEK_EVENT = "dramatube:seek";

/** Ask the player on this page to jump to a time (description timestamps use it). */
export function seekPlayer(seconds: number) {
  window.dispatchEvent(new CustomEvent(SEEK_EVENT, { detail: seconds }));
}

export const AUTOPLAY_KEY = "dt_autoplay";

/** Ask the server to count a view; it decides (see lib/views.ts). */
export function postView(videoId: string, ticket: string) {
  return fetch(`/api/videos/${videoId}/view`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket }),
  }).catch(() => {});
}

export function readAutoplay(): boolean {
  try {
    return window.localStorage.getItem(AUTOPLAY_KEY) !== "0";
  } catch {
    return true;
  }
}

const autoplayListeners = new Set<() => void>();

function subscribeAutoplay(listener: () => void) {
  autoplayListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    autoplayListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The autoplay preference, read from this browser; the server assumes on. */
export function useAutoplay(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribeAutoplay, readAutoplay, () => true);
  const set = (value: boolean) => {
    try {
      window.localStorage.setItem(AUTOPLAY_KEY, value ? "1" : "0");
    } catch {
      /* storage blocked: nothing to remember it in */
    }
    autoplayListeners.forEach((listener) => listener());
  };
  return [on, set];
}

/**
 * The player is the browser's own: its controls are keyboard- and
 * screen-reader-accessible on every platform, which no custom bar has
 * matched for free. What this adds is around it — counting a view only
 * after real playback, remembering where a signed-in viewer stopped, and
 * rolling into the next episode.
 */
export function Player({
  videoId,
  src,
  poster,
  width,
  height,
  durationSec,
  startAt,
  signedIn,
  next,
  countable,
  viewTicket,
}: {
  videoId: string;
  src: string;
  poster: string | null;
  width: number;
  height: number;
  durationSec: number;
  startAt: number;
  signedIn: boolean;
  next: { id: string; title: string } | null;
  countable: boolean;
  viewTicket: string;
}) {
  const t = useT();
  const router = useRouter();
  const ref = useRef<HTMLVideoElement>(null);
  const counted = useRef(false);
  const played = useRef(0);
  const lastTick = useRef<number | null>(null);
  const lastSaved = useRef(0);
  const [resumedAt, setResumedAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const tall = isVertical(width, height);

  // Seek requests from timestamps in the description and comments.
  useEffect(() => {
    const onSeek = (event: Event) => {
      const video = ref.current;
      const seconds = (event as CustomEvent<number>).detail;
      if (!video || !Number.isFinite(seconds)) return;
      video.currentTime = seconds;
      void video.play().catch(() => {});
      video.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    window.addEventListener(SEEK_EVENT, onSeek);
    return () => window.removeEventListener(SEEK_EVENT, onSeek);
  }, []);

  // Start where asked (?t=) or where this viewer stopped last time.
  useEffect(() => {
    const video = ref.current;
    if (!video || startAt <= 0) return;
    const apply = () => {
      if (startAt < (video.duration || durationSec) - 5) {
        video.currentTime = startAt;
        setResumedAt(startAt);
        window.setTimeout(() => setResumedAt(null), 4000);
      }
    };
    if (video.readyState >= 1) apply();
    else video.addEventListener("loadedmetadata", apply, { once: true });
  }, [startAt, durationSec]);

  const saveProgress = (position: number, beacon = false, ended = false) => {
    if (!signedIn) return;
    const body = JSON.stringify(ended ? { position, ended } : { position });
    const url = `/api/videos/${videoId}/progress`;
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(url, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  };

  useEffect(() => {
    const onHide = () => {
      const video = ref.current;
      // At the end `onEnded` has already said so; the end position would undo it.
      if (video && video.currentTime > 0 && !video.ended) saveProgress(video.currentTime, true);
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      onHide();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const onTimeUpdate = () => {
    const video = ref.current;
    if (!video) return;
    const now = video.currentTime;
    // Count real playback, not seeking: only small forward steps add up.
    if (lastTick.current !== null) {
      const step = now - lastTick.current;
      if (step > 0 && step < 1.5) played.current += step;
    }
    lastTick.current = now;

    const duration = video.duration || durationSec || 0;
    const threshold = Math.min(10, Math.max(2, duration * 0.3));
    if (countable && !counted.current && played.current >= threshold) {
      counted.current = true;
      void postView(videoId, viewTicket);
    }
    if (signedIn && Math.abs(now - lastSaved.current) >= 15) {
      lastSaved.current = now;
      saveProgress(now);
    }
  };

  const onEnded = () => {
    // Finished: the next visit starts from the top, not the credits, and
    // Continue watching moves on to the next episode.
    saveProgress(0, false, true);
    if (next && readAutoplay()) setCountdown(5);
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      router.push(`/watch/${next!.id}`);
      return;
    }
    const timer = window.setTimeout(() => setCountdown((value) => (value === null ? null : value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, next, router]);

  return (
    <div className={clsx("relative overflow-hidden bg-black sm:rounded-xl", tall ? "mx-auto aspect-[9/16] max-h-[78vh]" : "aspect-video")}>
      <video
        ref={ref}
        key={videoId}
        src={src}
        poster={poster ?? undefined}
        controls
        autoPlay
        playsInline
        preload="metadata"
        className="h-full w-full"
        onTimeUpdate={onTimeUpdate}
        onSeeking={() => (lastTick.current = null)}
        // At the end the browser pauses, then ends: the pause must not overwrite "finished".
        onPause={() => ref.current && !ref.current.ended && saveProgress(ref.current.currentTime)}
        onEnded={onEnded}
        onPlay={() => setCountdown(null)}
      />
      {resumedAt !== null && (
        <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/75 px-2 py-1 text-xs text-white">
          {t("watch.resume", { time: formatDuration(resumedAt) })}
        </div>
      )}
      {countdown !== null && next && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
          <div className="text-sm text-muted">{t("watch.playingIn", { seconds: countdown })}</div>
          <div className="line-clamp-2 max-w-md text-lg font-semibold text-white">{next.title}</div>
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={() => setCountdown(null)}>
              {t("watch.cancel")}
            </button>
            <button className="btn btn-light" onClick={() => router.push(`/watch/${next.id}`)}>
              {t("watch.nextEpisode")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
