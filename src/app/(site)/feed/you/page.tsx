import Link from "next/link";
import { ChevronRight, LayoutDashboard, LogOut, Shield, SquarePlus } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { SignInWall } from "@/components/sign-in-wall";
import { VideoCard } from "@/components/video-card";
import { signOutAction } from "@/app/actions/auth";
import { mediaUrl } from "@/lib/storage";
import { pageContext } from "@/lib/viewer";
import { listHistory, listLiked } from "@/lib/videos";

export const metadata = { title: "You" };

/** The library: who you are here, what you watched, what you liked. */
export default async function YouPage() {
  const { user, admin, t, fmt } = await pageContext();
  if (!user) return <SignInWall title={t("nav.signInPrompt")} next="/feed/you" />;
  const [history, liked] = await Promise.all([listHistory(user.id, 12), listLiked(user.id, 12)]);

  const shelf = (title: string, href: string, list: typeof history, empty: string) => (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-text">{title}</h2>
        {list.length > 0 && (
          <Link href={href} className="flex items-center text-sm font-medium text-muted hover:text-text">
            {t("home.seeAll")} <ChevronRight size={16} />
          </Link>
        )}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {list.map((video) => (
            <div key={video.id} className="w-[240px] shrink-0">
              <VideoCard video={video} fmt={fmt} />
            </div>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="mx-auto max-w-[1284px] space-y-10 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={user.name} handle={user.handle} url={mediaUrl(user.avatarKey)} size={80} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-text">{user.name}</h1>
          <Link href={`/@${user.handle}`} className="text-sm text-muted hover:text-text">
            @{user.handle} · {t("nav.yourChannel")}
          </Link>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/studio" className="btn btn-ghost h-9">
              <LayoutDashboard size={16} /> {t("nav.studio")}
            </Link>
            <Link href="/upload" className="btn btn-ghost h-9">
              <SquarePlus size={16} /> {t("nav.upload")}
            </Link>
            {admin && (
              <Link href="/admin" className="btn btn-ghost h-9">
                <Shield size={16} /> {t("nav.admin")}
              </Link>
            )}
            <form action={signOutAction}>
              <button className="btn btn-ghost h-9">
                <LogOut size={16} /> {t("nav.signOut")}
              </button>
            </form>
          </div>
        </div>
      </div>
      {shelf(t("nav.history"), "/feed/history", history, t("feed.historyEmpty"))}
      {shelf(t("nav.liked"), "/feed/liked", liked, t("feed.likedEmpty"))}
    </div>
  );
}
