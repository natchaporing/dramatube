import Link from "next/link";
import { deleteSeriesAction } from "@/app/actions/studio";
import { ConfirmButton } from "@/components/studio/edit-form";
import { EditSeriesForm, NewSeriesForm } from "@/components/studio/series-forms";
import { PosterArt } from "@/components/series-poster";
import { PricingForm } from "@/components/studio/pricing-form";
import { sellerOf } from "@/lib/earnings";
import { EXCLUSIVE_DAYS, isExclusive } from "@/lib/money";
import { siteOrigin } from "@/lib/origin-server";
import { ownSeriesPricing } from "@/lib/studio";
import { pageContext } from "@/lib/viewer";
import { listSeries } from "@/lib/videos";

export const metadata = { title: "Series" };

/** A premiere is a day in Bangkok, where the audience is; "en-CA" writes it as YYYY-MM-DD. */
const BANGKOK_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" });

export default async function StudioSeriesPage() {
  const { user, t } = await pageContext();
  if (!user) return null;
  const [list, pricing, seller, origin] = await Promise.all([listSeries(user.id, true), ownSeriesPricing(user.id), sellerOf(user.id), siteOrigin()]);
  const canSell = seller?.status === "approved";
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div>
        <h1 className="text-xl font-bold text-text">{t("studio.seriesTitle")}</h1>
        <p className="mb-6 mt-1 max-w-2xl text-sm text-muted">{t("studio.seriesHint")}</p>
        {list.length === 0 ? (
          <p className="rounded-xl bg-surface p-8 text-center text-muted">{t("studio.noSeries")}</p>
        ) : (
          <div className="space-y-4">
            {list.map((item) => (
              <div key={item.id} className="flex flex-col gap-4 rounded-xl border border-line p-4 sm:flex-row">
                <Link href={`/series/${item.id}`} className="block w-32 shrink-0 sm:w-40">
                  <PosterArt card={item} className="rounded-lg" />
                  <div className="mt-1 text-xs text-muted">
                    {item.episodeCount === 1 ? t("series.oneEpisode") : t("series.episodes", { count: item.episodeCount })}
                  </div>
                </Link>
                <div className="min-w-0 flex-1">
                  <EditSeriesForm
                    initial={{
                      id: item.id,
                      title: item.title,
                      description: item.description,
                      hasPoster: Boolean(item.posterUrl),
                      tropes: item.tropes,
                      status: item.status,
                      plannedEpisodes: item.plannedEpisodes,
                      premiereDate: item.premiereAt ? BANGKOK_DATE.format(item.premiereAt) : "",
                    }}
                  />
                  <div className="mt-3">
                    <PricingForm
                      seriesId={item.id}
                      canSell={canSell}
                      shareLink={`${origin}/series/${item.id}?ref=${user.handle}`}
                      initial={(() => {
                        const row = pricing.get(item.id)!;
                        const until = row.exclusiveSince && isExclusive(row.exclusiveSince)
                          ? new Date(row.exclusiveSince.getTime() + EXCLUSIVE_DAYS * 86_400_000).toISOString()
                          : null;
                        return {
                          onSale: row.onSale,
                          freeEpisodes: row.freeEpisodes,
                          episodePrice: row.episodePrice,
                          seriesPricePercent: row.seriesPricePercent,
                          exclusiveUntil: until,
                          exclusiveOpen: row.exclusiveOpen,
                        };
                      })()}
                    />
                  </div>
                  <form action={deleteSeriesAction} className="mt-2">
                    <input type="hidden" name="seriesId" value={item.id} />
                    <ConfirmButton message={t("studio.deleteSeriesConfirm", { title: item.title })} className="btn btn-quiet h-8 text-xs text-bad">
                      {t("studio.deleteSeries")}
                    </ConfirmButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <aside>
        <NewSeriesForm />
      </aside>
    </div>
  );
}
