"use client";

import { useEffect, useRef } from "react";

export function EmbedPlayer({ videoId, src, poster, startAt }: { videoId: string; src: string; poster: string | null; startAt: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const counted = useRef(false);

  useEffect(() => {
    const video = ref.current;
    if (!video || startAt <= 0) return;
    const apply = () => (video.currentTime = startAt);
    if (video.readyState >= 1) apply();
    else video.addEventListener("loadedmetadata", apply, { once: true });
  }, [startAt]);

  return (
    <video
      ref={ref}
      src={src}
      poster={poster ?? undefined}
      controls
      playsInline
      preload="metadata"
      className="h-full w-full"
      onTimeUpdate={(event) => {
        const video = event.currentTarget;
        if (!counted.current && video.currentTime >= Math.min(10, Math.max(2, (video.duration || 0) * 0.3))) {
          counted.current = true;
          void fetch(`/api/videos/${videoId}/view`, { method: "POST" }).catch(() => {});
        }
      }}
    />
  );
}
