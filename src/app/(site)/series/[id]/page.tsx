import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Play } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { EmptyState, Placeholder, VideoRow } from "@/components/video-card";
import { db } from "@/db";
import { series, users } from "@/db/schema";
import { mediaUrl } from "@/lib/storage";
import { pageContext } from "@/lib/viewer";
import { seriesEpisodes } from "@/lib/videos";

async function load(id: string) {
  const [row] = await db
    .select({ series, channel: users })
    .from(series)
    .innerJoin(users, eq(users.id, series.channelId))
    .where(eq(series.id, id))
    .limit(1);
  return row ?? null;
}

export async function generateMetadata({ params }: PageProps<"/series/[id]">): Promise<Metadata> {
  const row = await load((await params).id);
  return row ? { title: row.series.title, description: row.series.description.slice(0, 200) || undefined } : { title: "Series" };
}

export default async function SeriesPage({ params }: PageProps<"/series/[id]">) {
  const { id } = await params;
  const { user, t, fmt } = await pageContext();
  const row = await load(id);
  if (!row) return <EmptyState title={t("common.notFound")} />;

  const own = user?.id === row.channel.id;
  // A stranger sees the public episodes; the owner sees every one, labelled.
  const episodes = await seriesEpisodes(id, own);
  const cover = episodes[0]?.thumbnailUrl ?? null;

  return (
    <div className="mx-auto flex max-w-[1284px] flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
      <div className="shrink-0 overflow-hidden rounded-2xl bg-surface lg:sticky lg:top-20 lg:w-[360px] lg:self-start">
        <div className="relative aspect-video">
          {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <Placeholder title={row.series.title} />}
        </div>
        <div className="space-y-3 p-5">
          <h1 className="text-2xl font-bold text-text">{row.series.title}</h1>
          <Link href={`/@${row.channel.handle}`} className="flex items-center gap-2 text-sm font-medium text-text hover:underline">
            <Avatar name={row.channel.name} handle={row.channel.handle} url={mediaUrl(row.channel.avatarKey)} size={24} />
            {t("series.by", { name: row.channel.name })}
          </Link>
          <div className="text-sm text-muted">
            {episodes.length === 1 ? t("series.oneEpisode") : t("series.episodes", { count: episodes.length })}
          </div>
          {row.series.description && <p className="whitespace-pre-wrap text-sm text-muted">{row.series.description}</p>}
          {episodes[0] && (
            <Link href={`/watch/${episodes[0].id}`} className="btn btn-light w-full">
              <Play size={16} className="fill-ground" /> {t("series.playAll")}
            </Link>
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {episodes.length === 0 ? (
          <EmptyState title={t("series.empty")} />
        ) : (
          episodes.map((episode) => <VideoRow key={episode.id} video={episode} fmt={fmt} size="lg" />)
        )}
      </div>
    </div>
  );
}
