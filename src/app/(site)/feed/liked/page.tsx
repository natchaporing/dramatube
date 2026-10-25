import { SignInWall } from "@/components/sign-in-wall";
import { EmptyState, VideoRow } from "@/components/video-card";
import { pageContext } from "@/lib/viewer";
import { listLiked, withLocks } from "@/lib/videos";

export const metadata = { title: "Liked videos" };

export default async function LikedPage() {
  const { user, t, fmt } = await pageContext();
  if (!user) return <SignInWall title={t("feed.likedEmpty")} next="/feed/liked" />;
  const videos = await withLocks(user, await listLiked(user.id));
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-xl font-bold text-text">{t("nav.liked")}</h1>
      {videos.length === 0 ? (
        <EmptyState title={t("feed.likedEmpty")} />
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
