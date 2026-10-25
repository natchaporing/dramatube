import Link from "next/link";
import { Eye, Pencil } from "lucide-react";
import { Thumbnail } from "@/components/video-card";
import { formatCount, formatDate } from "@/lib/format";
import { pageContext } from "@/lib/viewer";
import { channelStats, listChannelVideos } from "@/lib/videos";

export const metadata = { title: "Studio" };

export default async function StudioPage() {
  const { user, t, locale, fmt } = await pageContext();
  if (!user) return null;
  const [stats, videos] = await Promise.all([
    channelStats(user.id),
    listChannelVideos(user.id, { includeHidden: true, limit: 500 }),
  ]);

  const tiles = [
    { label: t("studio.statSubscribers"), value: user.subscriberCount },
    { label: t("studio.statViews"), value: stats.views },
    { label: t("studio.statVideos"), value: stats.videos },
    { label: t("studio.statLikes"), value: stats.likes },
    { label: t("studio.statComments"), value: stats.comments },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl bg-surface p-4">
            <div className="text-xs font-medium text-muted">{tile.label}</div>
            <div className="mt-1 text-2xl font-bold text-text">{formatCount(tile.value, locale)}</div>
          </div>
        ))}
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-text">{t("studio.title")}</h1>
          <Link href="/upload" className="btn btn-primary">
            {t("nav.upload")}
          </Link>
        </div>
        {videos.length === 0 ? (
          <div className="rounded-xl bg-surface p-12 text-center">
            <p className="text-muted">{t("studio.empty")}</p>
            <Link href="/upload" className="btn btn-light mt-4">
              {t("studio.uploadFirst")}
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("studio.colVideo")}</th>
                  <th className="px-4 py-3 font-medium">{t("studio.colVisibility")}</th>
                  <th className="px-4 py-3 font-medium">{t("studio.colDate")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("studio.colViews")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("studio.colComments")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("studio.colLikes")}</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((video) => (
                  <tr key={video.id} className="group border-t border-line hover:bg-surface">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link href={`/studio/videos/${video.id}`} className="w-32 shrink-0">
                          <Thumbnail video={video} fmt={fmt} className="rounded-md" showBadges={false} />
                        </Link>
                        <div className="min-w-0">
                          <Link href={`/studio/videos/${video.id}`} className="line-clamp-2 font-medium text-text hover:underline">
                            {video.title}
                          </Link>
                          <div className="mt-1 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                            <Link href={`/studio/videos/${video.id}`} className="btn btn-quiet h-7 px-2 text-xs">
                              <Pencil size={14} /> {t("studio.edit")}
                            </Link>
                            <Link href={`/watch/${video.id}`} className="btn btn-quiet h-7 px-2 text-xs">
                              <Eye size={14} /> {t("studio.view")}
                            </Link>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {video.status === "removed" ? (
                        <span className="text-bad">{t("video.removed")}</span>
                      ) : (
                        t(`video.${video.visibility}`)
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDate(video.publishedAt, locale)}</td>
                    <td className="px-4 py-3 text-right text-text">{formatCount(video.viewCount, locale)}</td>
                    <td className="px-4 py-3 text-right text-text">{formatCount(video.commentCount, locale)}</td>
                    <td className="px-4 py-3 text-right text-text">{formatCount(video.likeCount, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
