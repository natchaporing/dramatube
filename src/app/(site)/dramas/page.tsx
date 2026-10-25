import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { ContinueBar } from "@/components/continue-bar";
import { PosterGrid, SeriesPoster, continueBarProps, tropeLabel } from "@/components/series-poster";
import { EmptyState } from "@/components/video-card";
import { cachedShelf, cachedUsedTropes, continueWatching, seriesWithTrope, type Shelf } from "@/lib/dramas";
import { tropeFromSlug, tropeSlug } from "@/lib/tropes";
import { pageContext } from "@/lib/viewer";

export const metadata: Metadata = { title: "Dramas" };

const TABS: Shelf[] = ["popular", "new", "rankings", "coming"];

/** Every series, as posters: by popularity, by release, by all-time plays, or announced. Or by trope. */
export default async function DramasPage({ searchParams }: PageProps<"/dramas">) {
  const params = await searchParams;
  const tab: Shelf = TABS.includes(params.tab as Shelf) ? (params.tab as Shelf) : "popular";
  const trope = tropeFromSlug(typeof params.trope === "string" ? params.trope : null);
  const { user, t, fmt } = await pageContext();

  const [list, tropes, cont] = await Promise.all([
    trope ? seriesWithTrope(trope, 96) : cachedShelf(tab, 96),
    cachedUsedTropes(),
    user ? continueWatching(user.id, 1) : Promise.resolve([]),
  ]);

  const chip = (active: boolean) => clsx("chip", active ? "bg-text text-ground" : "bg-raised text-text hover:bg-hover");

  return (
    <div className={clsx("px-4 pt-4 sm:px-6", cont.length > 0 ? "pb-32" : "pb-12")}>
      <h1 className="text-2xl font-bold text-text">{trope ? t("dramas.trope", { trope: tropeLabel(trope, fmt) }) : t("dramas.title")}</h1>
      <div className="mt-4 flex gap-5 border-b border-line text-sm">
        {TABS.map((name) => (
          <Link
            key={name}
            href={name === "popular" ? "/dramas" : `/dramas?tab=${name}`}
            className={clsx(
              "-mb-px border-b-2 pb-2",
              !trope && name === tab ? "border-brand font-semibold text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t(`dramas.tab.${name}`)}
          </Link>
        ))}
      </div>
      {tropes.length > 0 && (
        <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <Link href="/dramas" className={chip(!trope)}>
            {t("dramas.allTropes")}
          </Link>
          {tropes.map((name) => (
            <Link key={name} href={`/dramas?trope=${tropeSlug(name)}`} className={chip(trope === name)}>
              {tropeLabel(name, fmt)}
            </Link>
          ))}
        </div>
      )}
      <div className="mt-6">
        {list.length === 0 ? (
          <EmptyState title={t(!trope && tab === "coming" ? "dramas.emptyComing" : "dramas.empty")} />
        ) : (
          <PosterGrid>
            {list.map((card, index) => (
              <SeriesPoster key={card.id} card={card} fmt={fmt} rank={!trope && tab === "rankings" ? index + 1 : undefined} />
            ))}
          </PosterGrid>
        )}
      </div>
      {cont[0] && <ContinueBar {...continueBarProps(cont[0], fmt)} />}
    </div>
  );
}
