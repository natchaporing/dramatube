import Link from "next/link";
import clsx from "clsx";
import { ChevronRight, Clapperboard, Flame, Hourglass, Smartphone, Sparkles, Trophy } from "lucide-react";
import { ContinueBar } from "@/components/continue-bar";
import { PosterShelf, SHELF_POSTER, SeriesPoster, continueBarProps, tropeLabel } from "@/components/series-poster";
import { EmptyState, VerticalCard, VideoGrid } from "@/components/video-card";
import { CATEGORIES, isCategory } from "@/lib/catalog";
import { cachedShelf, cachedUsedTropes, continueWatching } from "@/lib/dramas";
import { tropeSlug } from "@/lib/tropes";
import { pageContext } from "@/lib/viewer";
import { listFeed, withLocks, type FeedSort } from "@/lib/videos";

const PAGE = 48;
const SORTS: FeedSort[] = ["trending", "latest", "popular"];

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const category = isCategory(params.c) ? params.c : null;
  const sort: FeedSort = SORTS.includes(params.sort as FeedSort) ? (params.sort as FeedSort) : "trending";
  const page = Math.max(1, Math.min(50, Number(params.page) || 1));
  const { user, t, fmt } = await pageContext();

  // Dramas lead the home page: the first page of "All", whatever the sort.
  const dramas = !category && page === 1;
  const [videos, vertical, cont, popular, top, fresh, coming, tropes] = await Promise.all([
    listFeed({ category, sort, limit: PAGE * page + 1, shape: category ? "any" : "horizontal" }).then((list) => withLocks(user, list)),
    category || page > 1 ? Promise.resolve([]) : listFeed({ shape: "vertical", limit: 12 }).then((list) => withLocks(user, list)),
    dramas && user ? continueWatching(user.id) : Promise.resolve([]),
    dramas ? cachedShelf("popular", 18) : Promise.resolve([]),
    dramas ? cachedShelf("rankings", 10) : Promise.resolve([]),
    dramas ? cachedShelf("new", 18) : Promise.resolve([]),
    dramas ? cachedShelf("coming", 12) : Promise.resolve([]),
    dramas ? cachedUsedTropes() : Promise.resolve([]),
  ]);
  const anyDramas = popular.length > 0 || coming.length > 0;
  const hasMore = videos.length > PAGE * page;
  const shown = videos.slice(0, PAGE * page);

  const href = (next: { c?: string | null; sort?: FeedSort; page?: number }) => {
    const query = new URLSearchParams();
    const c = next.c === undefined ? category : next.c;
    const s = next.sort ?? sort;
    if (c) query.set("c", c);
    if (s !== "trending") query.set("sort", s);
    if (next.page && next.page > 1) query.set("page", String(next.page));
    const text = query.toString();
    return text ? `/?${text}` : "/";
  };

  // The sort is for the videos. Under the drama shelves it sits with them,
  // not at the top of the page where it would seem to sort the dramas.
  const sortTabs = (
    <div className="mt-3 flex gap-4 text-sm" data-testid="sort-tabs">
      {SORTS.map((s) => (
        <Link
          key={s}
          href={href({ sort: s, page: 1 })}
          scroll={!dramas}
          className={clsx("border-b-2 pb-1", s === sort ? "border-text font-medium text-text" : "border-transparent text-muted hover:text-text")}
        >
          {t(`sort.${s}`)}
        </Link>
      ))}
    </div>
  );

  const chip = (active: boolean) =>
    clsx("chip", active ? "bg-text text-ground" : "bg-raised text-text hover:bg-hover");

  // The two halves of the home page: wide videos in the grid, tall ones on
  // their own shelf, so a 9:16 drama is never letterboxed into a 16:9 slot.
  const firstRow = shown.slice(0, 8);
  const rest = shown.slice(8);

  return (
    <div className={clsx("px-4 sm:px-6", cont.length > 0 ? "pb-32" : "pb-12")}>
      <div className="sticky top-14 z-30 -mx-4 bg-ground/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          <Link href={href({ c: null, page: 1 })} className={chip(!category)}>
            {t("category.all")}
          </Link>
          {CATEGORIES.filter((c) => c !== "other").map((c) => (
            <Link key={c} href={href({ c, page: 1 })} className={chip(category === c)}>
              {t(`category.${c}`)}
            </Link>
          ))}
        </div>
        {!dramas && sortTabs}
      </div>

      {dramas && (cont.length > 0 || anyDramas) && (
        <div className="mt-4 space-y-8" data-testid="drama-shelves">
          {cont.length > 0 && (
            <PosterShelf title={t("home.continue")} fmt={fmt} testId="continue-shelf">
              {cont.map((item) => (
                <SeriesPoster key={item.series.id} card={item.series} fmt={fmt} progress={item} className={SHELF_POSTER} />
              ))}
            </PosterShelf>
          )}
          {popular.length > 0 && (
            <PosterShelf title={<><Flame size={20} className="text-brand" /> {t("home.popularDramas")}</>} href="/dramas" fmt={fmt} testId="popular-shelf">
              {popular.map((card) => (
                <SeriesPoster key={card.id} card={card} fmt={fmt} className={SHELF_POSTER} />
              ))}
            </PosterShelf>
          )}
          {top.length >= 3 && (
            <PosterShelf title={<><Trophy size={20} className="text-warn" /> {t("home.topDramas")}</>} href="/dramas?tab=rankings" fmt={fmt}>
              {top.map((card, index) => (
                <SeriesPoster key={card.id} card={card} fmt={fmt} rank={index + 1} className={SHELF_POSTER} />
              ))}
            </PosterShelf>
          )}
          {fresh.length > 0 && (
            <PosterShelf title={<><Sparkles size={20} className="text-ai" /> {t("home.newDramas")}</>} href="/dramas?tab=new" fmt={fmt}>
              {fresh.map((card) => (
                <SeriesPoster key={card.id} card={card} fmt={fmt} className={SHELF_POSTER} />
              ))}
            </PosterShelf>
          )}
          {coming.length > 0 && (
            <PosterShelf title={<><Hourglass size={20} className="text-ai" /> {t("home.comingSoon")}</>} href="/dramas?tab=coming" fmt={fmt}>
              {coming.map((card) => (
                <SeriesPoster key={card.id} card={card} fmt={fmt} className={SHELF_POSTER} />
              ))}
            </PosterShelf>
          )}
          {tropes.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold text-text sm:text-xl">{t("home.byTrope")}</h2>
              <div className="flex flex-wrap gap-2">
                {tropes.map((trope) => (
                  <Link key={trope} href={`/dramas?trope=${tropeSlug(trope)}`} className="chip bg-raised text-text hover:bg-hover">
                    {tropeLabel(trope, fmt)}
                  </Link>
                ))}
              </div>
            </section>
          )}
          <div className="border-t border-line pt-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-text sm:text-xl">
              <Clapperboard size={20} className="text-muted" /> {t("home.videos")}
            </h2>
            {sortTabs}
          </div>
        </div>
      )}
      {dramas && !(cont.length > 0 || anyDramas) && sortTabs}

      {shown.length === 0 && vertical.length === 0 ? (
        <EmptyState
          title={t("home.empty")}
          hint={t("home.emptyHint")}
          action={
            <Link href="/upload" className="btn btn-primary">
              {t("nav.upload")}
            </Link>
          }
        />
      ) : (
        <div className="mt-4 space-y-10">
          {firstRow.length > 0 && <VideoGrid videos={firstRow} fmt={fmt} />}
          {vertical.length > 0 && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-xl font-bold text-text">
                  <Smartphone size={22} className="text-brand" /> {t("home.verticalShelf")}
                </h2>
                <Link href="/vertical" className="flex items-center text-sm font-medium text-muted hover:text-text">
                  {t("home.seeAll")} <ChevronRight size={16} />
                </Link>
              </div>
              <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                {vertical.map((video) => (
                  <VerticalCard key={video.id} video={video} fmt={fmt} />
                ))}
              </div>
            </section>
          )}
          {rest.length > 0 && <VideoGrid videos={rest} fmt={fmt} />}
          {hasMore && (
            <div className="flex justify-center">
              <Link href={href({ page: page + 1 })} className="btn btn-ghost" scroll={false}>
                {t("home.more")}
              </Link>
            </div>
          )}
        </div>
      )}
      {cont[0] && <ContinueBar {...continueBarProps(cont[0], fmt)} />}
    </div>
  );
}
