import Link from "next/link";
import { BadgeCheck, Clock3, ShieldAlert } from "lucide-react";
import { PayoutButton, SellerForm, ShareLink } from "@/components/studio/earnings-forms";
import { earningsSummary, payoutsOf, recentSales, sellerOf } from "@/lib/earnings";
import { formatDate } from "@/lib/format";
import { MIN_PAYOUT_CREDITS, creditsToSatang, satangToBaht } from "@/lib/money";
import { siteOrigin } from "@/lib/origin-server";
import { pageContext } from "@/lib/viewer";

export const metadata = { title: "Earnings" };

export default async function EarningsPage() {
  const { user, t, locale } = await pageContext();
  if (!user) return null;
  const [seller, summary, sales, payouts, origin] = await Promise.all([
    sellerOf(user.id),
    earningsSummary(user.id),
    recentSales(user.id),
    payoutsOf(user.id),
    siteOrigin(),
  ]);
  const now = new Date();
  const approved = seller?.status === "approved";
  const tiles = [
    { label: t("earn.available"), credits: summary.available, strong: true },
    { label: t("earn.held"), credits: summary.held, hint: t("earn.heldHint") },
    { label: t("earn.requested"), credits: summary.requested },
    { label: t("earn.paid"), credits: summary.paid },
  ];

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-xl font-bold text-text">{t("earn.title")}</h1>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className={`rounded-xl p-4 ${tile.strong ? "bg-brand-dim/50 ring-1 ring-brand/40" : "bg-surface"}`}>
              <div className="text-xs font-medium text-muted">{tile.label}</div>
              <div className="mt-1 text-2xl font-bold text-text tabular-nums" data-testid={tile.strong ? "earn-available" : undefined}>
                {satangToBaht(creditsToSatang(tile.credits))}
              </div>
              <div className="text-xs text-faint">{t("earn.credits", { count: tile.credits.toLocaleString() })}</div>
              {tile.hint && <div className="mt-1 text-[11px] text-faint">{tile.hint}</div>}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <PayoutButton
            label={t("earn.cashOut", { amount: satangToBaht(creditsToSatang(summary.available)) })}
            disabled={!approved || summary.available < MIN_PAYOUT_CREDITS}
          />
          <p className="max-w-md text-xs text-muted">{t("earn.minimum")}</p>
        </div>
        <p className="text-xs text-faint">{t("earn.renderSoon")}</p>
      </section>

      <section className="space-y-3 rounded-xl border border-line p-5">
        <h2 className="font-semibold text-text">{t("earn.shareTitle")}</h2>
        <p className="text-sm text-muted">{t("earn.shareHint")}</p>
        <ShareLink link={`${origin}/@${user.handle}?ref=${user.handle}`} />
        <p className="text-xs text-faint" data-testid="attribution-counts">
          {t("earn.direct30", { direct: summary.direct, discovered: summary.discovered })}
        </p>
      </section>

      <section className="space-y-4 rounded-xl border border-line p-5">
        <h2 className="flex items-center gap-2 font-semibold text-text">
          {approved ? <BadgeCheck size={18} className="text-good" /> : seller?.status === "pending" ? <Clock3 size={18} className="text-warn" /> : null}
          {t("seller.title")}
        </h2>
        {approved ? (
          <>
            <p className="text-sm text-good" data-testid="seller-status">{t("seller.approved")}</p>
            <p className="text-xs text-muted">{t("seller.payTo", { id: seller.promptpayId, name: seller.legalName })}</p>
            <Link href="/studio/series" className="btn btn-ghost h-9">
              {t("studio.series")}
            </Link>
          </>
        ) : (
          <>
            {seller?.status === "pending" && <p className="text-sm text-warn" data-testid="seller-status">{t("seller.pending")}</p>}
            {seller?.status === "rejected" && (
              <p className="flex items-start gap-2 text-sm text-bad">
                <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                {t("seller.rejected", { note: seller.note || "—" })}
              </p>
            )}
            {!seller && <p className="text-sm text-muted">{t("seller.intro")}</p>}
            <SellerForm
              reapply={Boolean(seller)}
              initial={seller ? { legalName: seller.legalName, promptpayId: seller.promptpayId, birthDate: seller.birthDate } : null}
            />
          </>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-text">{t("earn.sales")}</h2>
        {sales.length === 0 ? (
          <p className="text-sm text-muted">{t("earn.noSales")}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-surface text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("earn.colDate")}</th>
                  <th className="px-4 py-3 font-medium">{t("earn.colEpisode")}</th>
                  <th className="px-4 py-3 font-medium">{t("earn.colSource")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("earn.colCredits")}</th>
                  <th className="px-4 py-3 font-medium">{t("earn.colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-t border-line" data-testid="sale-row">
                    <td className="px-4 py-3 text-muted">{formatDate(sale.createdAt, locale)}</td>
                    <td className="px-4 py-3">
                      {sale.videoId && sale.title ? (
                        <Link href={`/watch/${sale.videoId}`} className="line-clamp-1 text-text hover:underline">
                          {sale.title}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={sale.attribution === "direct" ? "text-brand" : "text-muted"} data-testid="sale-source">
                        {t(sale.attribution === "direct" ? "earn.direct" : "earn.discovered")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-text" data-testid="sale-credits">
                      {sale.credits}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {sale.kind === "clawback"
                        ? t("earn.statusClawback")
                        : sale.status === "reversed"
                          ? t("earn.statusReversed")
                          : sale.status === "paid"
                            ? t("earn.statusPaid")
                            : sale.availableAt > now
                              ? t("earn.statusHeld", { date: formatDate(sale.availableAt, locale) })
                              : t("earn.statusAvailable")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {payouts.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold text-text">{t("earn.payouts")}</h2>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {payouts.map((payout) => (
              <li key={payout.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div>
                  <div className="font-medium text-text">{satangToBaht(payout.amountSatang)}</div>
                  <div className="text-xs text-faint">{formatDate(payout.requestedAt, locale)}</div>
                </div>
                <span className="text-xs text-muted">
                  {payout.status === "rejected" ? t("earn.payout.rejected", { note: payout.note || "—" }) : t(`earn.payout.${payout.status}`)}
                  {payout.reference ? ` · ${payout.reference}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
