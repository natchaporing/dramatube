import Link from "next/link";
import clsx from "clsx";
import { ChevronRight, Smartphone } from "lucide-react";
import { EmptyState, VerticalCard, VideoGrid } from "@/components/video-card";
import { CATEGORIES, isCategory } from "@/lib/catalog";
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

  const [videos, vertical] = await Promise.all([
    listFeed({ category, sort, limit: PAGE * page + 1, shape: category ? "any" : "horizontal" }).then((list) => withLocks(user, list)),
    category || page > 1 ? Promise.resolve([]) : listFeed({ shape: "vertical", limit: 12 }).then((list) => withLocks(user, list)),
  ]);
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

  const chip = (active: boolean) =>
    clsx("chip", active ? "bg-text text-ground" : "bg-raised text-text hover:bg-hover");

  // The two halves of the home page: wide videos in the grid, tall ones on
  // their own shelf, so a 9:16 drama is never letterboxed into a 16:9 slot.
  const firstRow = shown.slice(0, 8);
  const rest = shown.slice(8);

  return (
    <div className="px-4 pb-12 sm:px-6">
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
        <div className="mt-3 flex gap-4 text-sm">
          {SORTS.map((s) => (
            <Link
              key={s}
              href={href({ sort: s, page: 1 })}
              className={clsx("border-b-2 pb-1", s === sort ? "border-text font-medium text-text" : "border-transparent text-muted hover:text-text")}
            >
              {t(`sort.${s}`)}
            </Link>
          ))}
        </div>
      </div>

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
    </div>
  );
}
