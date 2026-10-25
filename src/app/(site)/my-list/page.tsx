import type { Metadata } from "next";
import clsx from "clsx";
import { ContinueBar } from "@/components/continue-bar";
import { PosterGrid, SeriesPoster, continueBarProps } from "@/components/series-poster";
import { SignInWall } from "@/components/sign-in-wall";
import { EmptyState } from "@/components/video-card";
import { continueWatching, myListCards } from "@/lib/dramas";
import { pageContext } from "@/lib/viewer";

export const metadata: Metadata = { title: "My List" };

export default async function MyListPage() {
  const { user, t, fmt } = await pageContext();
  if (!user) return <SignInWall title={t("myList.signIn")} next="/my-list" />;
  const [list, cont] = await Promise.all([myListCards(user.id), continueWatching(user.id, 1)]);
  return (
    <div className={clsx("px-4 pt-4 sm:px-6", cont.length > 0 ? "pb-32" : "pb-12")}>
      <h1 className="mb-6 text-2xl font-bold text-text">{t("myList.title")}</h1>
      {list.length === 0 ? (
        <EmptyState title={t("myList.empty")} hint={t("myList.emptyHint")} />
      ) : (
        <PosterGrid>
          {list.map((card) => (
            <SeriesPoster key={card.id} card={card} fmt={fmt} />
          ))}
        </PosterGrid>
      )}
      {cont[0] && <ContinueBar {...continueBarProps(cont[0], fmt)} />}
    </div>
  );
}
