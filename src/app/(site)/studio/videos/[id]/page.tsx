import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, ExternalLink, ShieldAlert } from "lucide-react";
import { db } from "@/db";
import { videos } from "@/db/schema";
import { deleteVideoAction } from "@/app/actions/studio";
import { ConfirmButton, EditVideoForm } from "@/components/studio/edit-form";
import { EmptyState } from "@/components/video-card";
import { formatBytes, formatDuration } from "@/lib/format";
import { mediaUrl } from "@/lib/storage";
import { listOwnSeries } from "@/lib/studio";
import { pageContext } from "@/lib/viewer";

export const metadata = { title: "Edit video" };

export default async function EditVideoPage({ params }: PageProps<"/studio/videos/[id]">) {
  const { id } = await params;
  const { user, t } = await pageContext();
  if (!user) return null;
  const [video] = await db.select().from(videos).where(and(eq(videos.id, id), eq(videos.channelId, user.id))).limit(1);
  if (!video) return <EmptyState title={t("upload.error.not_found")} />;
  const seriesOptions = await listOwnSeries(user.id);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <Link href="/studio" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
          <ArrowLeft size={16} /> {t("studio.back")}
        </Link>
        <h1 className="mb-6 text-2xl font-bold text-text">{t("studio.editTitle")}</h1>
        {video.status === "removed" && (
          <div className="mb-6 flex items-start gap-2 rounded-lg bg-bad-dim px-4 py-3 text-sm text-bad">
            <ShieldAlert size={18} className="mt-0.5 shrink-0" />
            {t("watch.removedNotice", { reason: video.removedReason ?? "—" })}
          </div>
        )}
        <EditVideoForm
          videoId={video.id}
          thumbnailUrl={mediaUrl(video.thumbnailKey)}
          seriesOptions={seriesOptions}
          initial={{
            title: video.title,
            description: video.description,
            visibility: video.visibility,
            category: video.category,
            tags: video.tags,
            aiUsage: video.aiUsage,
            aiModels: video.aiModels,
            prompt: video.prompt,
            seriesId: video.seriesId,
            episodeNumber: video.episodeNumber,
          }}
        />
      </div>
      <aside className="space-y-4">
        <div className="overflow-hidden rounded-xl bg-surface lg:sticky lg:top-20">
          <video src={mediaUrl(video.videoKey)!} poster={mediaUrl(video.thumbnailKey) ?? undefined} controls preload="metadata" className="aspect-video w-full bg-black" />
          <div className="space-y-2 p-4 text-sm">
            <Link href={`/watch/${video.id}`} className="flex items-center gap-1.5 font-medium text-[#8ab4ff] hover:underline">
              /watch/{video.id} <ExternalLink size={14} />
            </Link>
            <div className="text-xs text-muted">
              {t("studio.fileInfo")}: {formatBytes(video.byteSize)} · {formatDuration(video.durationSec)} · {video.width}×{video.height} · {video.mimeType}
            </div>
          </div>
          <form action={deleteVideoAction} className="border-t border-line p-4">
            <input type="hidden" name="videoId" value={video.id} />
            <div className="text-sm font-medium text-text">{t("studio.dangerZone")}</div>
            <p className="mb-3 mt-1 text-xs text-muted">{t("studio.dangerHint")}</p>
            <ConfirmButton message={t("studio.deleteConfirm", { title: video.title })} className="btn btn-danger h-9">
              {t("studio.delete")}
            </ConfirmButton>
          </form>
        </div>
      </aside>
    </div>
  );
}
