import Link from "next/link";
import { ListVideo } from "lucide-react";
import type { Fmt } from "./video-card";
import { Placeholder } from "./video-card";
import type { SeriesSummary } from "@/lib/videos";

export function SeriesCard({ item, fmt }: { item: SeriesSummary; fmt: Fmt }) {
  return (
    <Link href={`/series/${item.id}`} className="group block min-w-0">
      <div className="relative">
        {/* Two offset sheets behind the cover say "more than one" at a glance. */}
        <div className="absolute inset-x-3 -top-2 h-4 rounded-t-xl bg-hover" />
        <div className="absolute inset-x-1.5 -top-1 h-4 rounded-t-xl bg-line-bright" />
        <div className="relative aspect-video overflow-hidden rounded-xl bg-raised">
          {item.coverUrl ? (
            <img src={item.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <Placeholder title={item.title} />
          )}
          <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
            <ListVideo size={13} />
            {item.episodeCount === 1 ? fmt.t("series.oneEpisode") : fmt.t("series.episodes", { count: item.episodeCount })}
          </span>
        </div>
      </div>
      <h3 className="mt-3 line-clamp-2 text-[15px] font-semibold text-text">{item.title}</h3>
      {item.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{item.description}</p>}
    </Link>
  );
}
