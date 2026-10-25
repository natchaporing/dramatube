import Link from "next/link";
import { dismissReportsAction, removeVideoAction, restoreVideoAction } from "@/app/actions/admin";
import { EmptyState, Placeholder } from "@/components/video-card";
import { timeAgo } from "@/lib/format";
import { openReports, removedVideos } from "@/lib/moderation";
import { markPayoutPaidAction, rejectPayoutAction, reviewSellerAction } from "@/app/actions/money";
import { pendingSellers, requestedPayouts } from "@/lib/earnings";
import { ageOn, satangToBaht } from "@/lib/money";
import { pageContext } from "@/lib/viewer";

export const metadata = { title: "Moderation" };

export default async function AdminPage() {
  const { admin, t, locale } = await pageContext();
  if (!admin) return <EmptyState title={t("admin.forbidden")} />;
  const [queue, removed, applicants, payoutQueue] = await Promise.all([openReports(), removedVideos(), pendingSellers(), requestedPayouts()]);

  return (
    <div className="mx-auto max-w-[1100px] space-y-10 px-4 py-6 sm:px-6">
      <section>
        <h2 className="mb-4 text-2xl font-bold text-text">{t("admin.payouts")}</h2>
        {payoutQueue.length === 0 ? (
          <p className="rounded-xl bg-surface p-6 text-center text-muted">{t("admin.noPayouts")}</p>
        ) : (
          <div className="space-y-3">
            {payoutQueue.map(({ payout, handle }) => (
              <div key={payout.id} className="flex flex-col gap-3 rounded-xl border border-line p-4 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-text">
                    {t("admin.sendTo", { amount: satangToBaht(payout.amountSatang), id: payout.promptpayId, name: payout.legalName })}
                  </div>
                  <div className="text-xs text-muted">
                    @{handle} · {t("earn.credits", { count: payout.credits.toLocaleString() })} · {timeAgo(payout.requestedAt, locale)}
                  </div>
                </div>
                <form action={markPayoutPaidAction} className="flex gap-2">
                  <input type="hidden" name="payoutId" value={payout.id} />
                  <input name="reference" placeholder={t("admin.reference")} className="field h-9 py-1" maxLength={120} />
                  <button className="btn btn-primary h-9 shrink-0">{t("admin.markPaid")}</button>
                </form>
                <form action={rejectPayoutAction} className="flex gap-2">
                  <input type="hidden" name="payoutId" value={payout.id} />
                  <input name="note" placeholder={t("admin.rejectNote")} className="field h-9 py-1" maxLength={300} />
                  <button className="btn btn-ghost h-9 shrink-0">{t("admin.rejectPayout")}</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold text-text">{t("admin.sellers")}</h2>
        {applicants.length === 0 ? (
          <p className="rounded-xl bg-surface p-6 text-center text-muted">{t("admin.noSellers")}</p>
        ) : (
          <div className="space-y-3">
            {applicants.map(({ seller, handle, name, email }) => (
              <div key={seller.userId} className="flex flex-col gap-3 rounded-xl border border-line p-4 md:flex-row md:items-center" data-testid="seller-application">
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-semibold text-text">
                    {seller.legalName} · <Link href={`/@${handle}`} className="text-[#8ab4ff] hover:underline">@{handle}</Link>
                  </div>
                  <div className="text-xs text-muted">
                    {name} · {email} · PromptPay {seller.promptpayId} · {t("admin.age", { age: ageOn(seller.birthDate) })}
                  </div>
                </div>
                <form action={reviewSellerAction}>
                  <input type="hidden" name="userId" value={seller.userId} />
                  <input type="hidden" name="decision" value="approve" />
                  <button className="btn btn-primary h-9">{t("admin.approve")}</button>
                </form>
                <form action={reviewSellerAction} className="flex gap-2">
                  <input type="hidden" name="userId" value={seller.userId} />
                  <input type="hidden" name="decision" value="reject" />
                  <input name="note" placeholder={t("admin.rejectNote")} className="field h-9 py-1" maxLength={300} />
                  <button className="btn btn-ghost h-9 shrink-0">{t("admin.reject")}</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h1 className="mb-6 text-2xl font-bold text-text">{t("admin.openReports")}</h1>
        {queue.length === 0 ? (
          <p className="rounded-xl bg-surface p-8 text-center text-muted">{t("admin.none")}</p>
        ) : (
          <div className="space-y-4">
            {queue.map((item) => (
              <div key={item.videoId} className="flex flex-col gap-4 rounded-xl border border-line p-4 md:flex-row">
                <Link href={`/watch/${item.videoId}`} className="block w-full shrink-0 md:w-56">
                  <div className="aspect-video overflow-hidden rounded-lg bg-raised">
                    {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <Placeholder title={item.video.title} />}
                  </div>
                </Link>
                <div className="min-w-0 flex-1 space-y-2">
                  <Link href={`/watch/${item.videoId}`} className="font-semibold text-text hover:underline">
                    {item.video.title}
                  </Link>
                  <div className="text-xs text-muted">
                    @{item.channelHandle} · {t("admin.reports", { count: item.count })} · {timeAgo(item.latest, locale)}
                    {item.video.status === "removed" && <span className="ml-2 text-bad">{t("video.removed")}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.reasons.map((reason) => (
                      <span
                        key={reason}
                        className={reason === "copyright" ? "rounded-full bg-bad-dim px-2.5 py-0.5 text-xs font-semibold text-bad" : "rounded-full bg-raised px-2.5 py-0.5 text-xs text-text"}
                      >
                        {t(`report.reason.${reason as "other"}`)}
                      </span>
                    ))}
                  </div>
                  {item.notes.map((note, index) => (
                    <p key={index} className="border-l-2 border-line pl-3 text-xs text-muted">
                      {note}
                    </p>
                  ))}
                  <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                    <form action={removeVideoAction} className="flex flex-1 gap-2">
                      <input type="hidden" name="videoId" value={item.videoId} />
                      <input name="reason" placeholder={t("admin.removeReason")} className="field h-9 py-1" maxLength={300} />
                      <button className="btn btn-danger h-9 shrink-0">{t("admin.remove")}</button>
                    </form>
                    <form action={dismissReportsAction}>
                      <input type="hidden" name="videoId" value={item.videoId} />
                      <button className="btn btn-ghost h-9">{t("admin.dismiss")}</button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {removed.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-text">{t("admin.removedVideos")}</h2>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {removed.map((video) => (
              <li key={video.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/watch/${video.id}`} className="font-medium text-text hover:underline">
                    {video.title}
                  </Link>
                  <div className="text-xs text-muted">
                    @{video.channelHandle} · {video.removedReason}
                  </div>
                </div>
                <form action={restoreVideoAction}>
                  <input type="hidden" name="videoId" value={video.id} />
                  <button className="btn btn-ghost h-8 text-xs">{t("admin.restore")}</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
