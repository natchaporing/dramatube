import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { Sparkles } from "lucide-react";
import { EmptyState, VideoRow } from "@/components/video-card";
import { CATEGORIES, canonicalModel, isCategory } from "@/lib/catalog";
import { pageContext } from "@/lib/viewer";
import { searchVideos, withLocks } from "@/lib/videos";

type Sort = "relevance" | "latest" | "views";
const SORTS: Sort[] = ["relevance", "latest", "views"];

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value ?? "").slice(0, 200);
}

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const params = await searchParams;
  const q = one(params.q) || one(params.model);
  return { title: q ? `${q}` : "Search", robots: { index: false } };
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const q = one(params.q).trim();
  const model = canonicalModel(one(params.model));
  const category = isCategory(params.c) ? params.c : null;
  const sort: Sort = SORTS.includes(params.sort as Sort) ? (params.sort as Sort) : "relevance";
  const { user, t, fmt } = await pageContext();

  if (!q && !model && !category) {
    return <EmptyState title={t("search.prompt")} />;
  }
  const results = await withLocks(user, await searchVideos({ query: q, model, category, sort }));

  const href = (next: { c?: string | null; sort?: Sort }) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (model) query.set("model", model);
    const c = next.c === undefined ? category : next.c;
    if (c) query.set("c", c);
    const s = next.sort ?? sort;
    if (s !== "relevance") query.set("sort", s);
    return `/search?${query.toString()}`;
  };
  const chip = (active: boolean) => clsx("chip", active ? "bg-text text-ground" : "bg-raised text-text hover:bg-hover");

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-4 sm:px-6">
      <h1 className="mb-3 flex items-center gap-2 text-lg font-semibold text-text">
        {model && !q ? (
          <>
            <Sparkles size={18} className="text-ai" /> {t("search.madeWith", { model })}
          </>
        ) : (
          t("search.resultsFor", { query: q || model || (category ? t(`category.${category}`) : "") })
        )}
      </h1>
      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
        <Link href={href({ c: null })} className={chip(!category)}>
          {t("search.anyCategory")}
        </Link>
        {CATEGORIES.map((c) => (
          <Link key={c} href={href({ c })} className={chip(category === c)}>
            {t(`category.${c}`)}
          </Link>
        ))}
      </div>
      <div className="mb-6 flex gap-4 text-sm">
        {SORTS.map((s) => (
          <Link
            key={s}
            href={href({ sort: s })}
            className={clsx("border-b-2 pb-1", s === sort ? "border-text font-medium text-text" : "border-transparent text-muted hover:text-text")}
          >
            {t(`sort.${s}`)}
          </Link>
        ))}
      </div>
      {results.length === 0 ? (
        <EmptyState title={t("search.none")} hint={t("search.noneHint")} />
      ) : (
        <div className="space-y-4">
          {results.map((video) => (
            <VideoRow key={video.id} video={video} fmt={fmt} size="lg" />
          ))}
        </div>
      )}
    </div>
  );
}
