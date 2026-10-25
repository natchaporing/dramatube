import { SignInWall } from "@/components/sign-in-wall";
import { EmptyState, VideoGrid } from "@/components/video-card";
import { pageContext } from "@/lib/viewer";
import { listSubscriptionFeed } from "@/lib/videos";

export const metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage() {
  const { user, t, fmt } = await pageContext();
  if (!user) return <SignInWall title={t("feed.subscriptionsEmpty")} next="/feed/subscriptions" />;
  const videos = await listSubscriptionFeed(user.id);
  return (
    <div className="px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-xl font-bold text-text">{t("nav.subscriptions")}</h1>
      {videos.length === 0 ? <EmptyState title={t("feed.subscriptionsEmpty")} /> : <VideoGrid videos={videos} fmt={fmt} />}
    </div>
  );
}
