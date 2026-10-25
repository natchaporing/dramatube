import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { EmbedPlayer } from "@/components/embed-player";
import { getT } from "@/lib/i18n/server";
import { getWatchable } from "@/lib/videos";
import { issueViewTicket } from "@/lib/views";
import { lockFor } from "@/lib/access";

export const metadata = { robots: { index: false } };

/**
 * The player other sites frame. Public and unlisted only, and never with a
 * viewer's session: an embed is somebody else's page, so it behaves as if
 * nobody is signed in.
 */
export default async function EmbedPage({ params, searchParams }: PageProps<"/embed/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const { t } = await getT();
  const video = await getWatchable(id, null);
  const start = Number(query.t);

  // Someone else's page cannot sell an episode: a locked one sends viewers here.
  if (video && (await lockFor(null, video.id)).locked) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-black p-6 text-center">
        <LogoMark className="h-8 w-8" />
        <Link href={`/watch/${video.id}`} target="_blank" className="font-medium text-white hover:underline">
          {video.title}
        </Link>
        <p className="text-sm text-muted">{t("paywall.embed")}</p>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="flex h-screen items-center justify-center bg-black p-6 text-center text-sm text-muted">
        {t("watch.notFound")}
      </div>
    );
  }

  return (
    <div className="group relative h-screen w-screen overflow-hidden bg-black">
      <EmbedPlayer
        videoId={video.id}
        src={video.videoUrl}
        poster={video.thumbnailUrl}
        startAt={Number.isFinite(start) && start > 0 ? start : 0}
        viewTicket={issueViewTicket(video.id)}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/80 to-transparent p-3 opacity-100 transition-opacity group-hover:opacity-100">
        <Link href={`/watch/${video.id}`} target="_blank" className="pointer-events-auto flex min-w-0 items-center gap-2 text-sm font-medium text-white">
          <LogoMark className="h-6 w-6 shrink-0" />
          <span className="truncate">{video.title}</span>
        </Link>
        <span className="ml-auto shrink-0 rounded bg-ai-dim/90 px-1.5 py-0.5 text-[10px] font-semibold text-ai">
          {t(video.aiUsage === "generated" ? "video.aiGenerated" : "video.aiAssisted")}
        </span>
      </div>
    </div>
  );
}
