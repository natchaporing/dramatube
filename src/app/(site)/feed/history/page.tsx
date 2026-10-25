import { SignInWall } from "@/components/sign-in-wall";
import { EmptyState, VideoRow } from "@/components/video-card";
import { clearHistoryAction } from "@/app/actions/social";
import { pageContext } from "@/lib/viewer";
import { listHistory, withLocks } from "@/lib/videos";

export const metadata = { title: "History" };

export default async function HistoryPage() {
  const { user, t, fmt } = await pageContext();
  if (!user) return <SignInWall title={t("feed.historyEmpty")} next="/feed/history" />;
  const videos = await withLocks(user, await listHistory(user.id));
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-text">{t("nav.history")}</h1>
        {videos.length > 0 && (
          <form action={clearHistoryAction}>
            <button className="btn btn-ghost">{t("feed.clearHistory")}</button>
          </form>
        )}
      </div>
      {videos.length === 0 ? (
        <EmptyState title={t("feed.historyEmpty")} />
      ) : (
        <div className="space-y-4">
          {videos.map((video) => (
            <VideoRow key={video.id} video={video} fmt={fmt} size="lg" />
          ))}
        </div>
      )}
    </div>
  );
}
