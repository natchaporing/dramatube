import Link from "next/link";
import { CheckCircle2, FlaskConical, TriangleAlert } from "lucide-react";
import { simulatePaymentAction } from "@/app/actions/wallet";
import { SignInWall } from "@/components/sign-in-wall";
import { EmptyState } from "@/components/video-card";
import { PayStatus } from "@/components/wallet/pay-status";
import { satangToBaht } from "@/lib/money";
import { settlePurchase } from "@/lib/payments";
import { pageContext } from "@/lib/viewer";
import { balanceOf, purchaseFor } from "@/lib/wallet";

export const metadata = { title: "Payment" };

export default async function PayPage({ params }: PageProps<"/wallet/pay/[id]">) {
  const { id } = await params;
  const { user, t } = await pageContext();
  if (!user) return <SignInWall title={t("pay.title")} next={`/wallet/pay/${id}`} />;
  let purchase = await purchaseFor(user.id, id);
  if (!purchase) return <EmptyState title={t("common.notFound")} />;

  // Coming back from Stripe, or reloading: ask the provider rather than wait for the webhook.
  try {
    const status = await settlePurchase(purchase);
    if (status !== purchase.status) purchase = (await purchaseFor(user.id, id))!;
  } catch (error) {
    console.error("settling on the pay page failed", error);
  }

  const amount = t("pay.amount", { price: satangToBaht(purchase.amountSatang), credits: (purchase.credits + purchase.bonusCredits).toLocaleString() });
  const back = purchase.returnTo ?? "/wallet";

  if (purchase.status === "paid") {
    const balance = await balanceOf(user.id);
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <CheckCircle2 size={56} className="mx-auto text-good" />
        <h1 className="mt-4 text-2xl font-bold text-text" data-testid="payment-done">{t("pay.paid")}</h1>
        <p className="mt-2 text-muted">{amount}</p>
        <p className="mt-1 text-muted">{t("pay.paidCredits", { balance: balance.total.toLocaleString() })}</p>
        <div className="mt-8 flex flex-col gap-2">
          {purchase.returnTo && (
            <Link href={purchase.returnTo} className="btn btn-primary">
              {t("pay.continue")}
            </Link>
          )}
          <Link href="/wallet" className="btn btn-ghost">
            {t("pay.toWallet")}
          </Link>
        </div>
      </div>
    );
  }

  if (purchase.status !== "pending") {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <TriangleAlert size={48} className="mx-auto text-warn" />
        <h1 className="mt-4 text-xl font-bold text-text">{t(purchase.status === "expired" ? "pay.expired" : "pay.failed")}</h1>
        <Link href={`/wallet${purchase.returnTo ? `?return=${encodeURIComponent(purchase.returnTo)}` : ""}`} className="btn btn-primary mt-8">
          {t("pay.tryAgain")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-text">{t(purchase.method === "promptpay" ? "pay.title" : "pay.cardTitle")}</h1>
        <p className="mt-1 text-muted">{amount}</p>
      </div>

      {purchase.provider === "omise" && (
        <div className="space-y-3 rounded-2xl bg-white p-5 text-center">
          {purchase.qrImageUrl ? (
            <img src={`/api/purchases/${purchase.id}/qr`} alt="PromptPay QR" className="mx-auto aspect-square w-full max-w-[280px]" />
          ) : (
            <p className="text-sm text-ground">{t("pay.qrMissing")}</p>
          )}
          <p className="text-sm font-medium text-ground">{t("pay.scan")}</p>
        </div>
      )}

      {purchase.provider === "dev" && (
        <form action={simulatePaymentAction} className="space-y-3 rounded-2xl border border-warn/40 bg-warn/10 p-5 text-center">
          <input type="hidden" name="purchaseId" value={purchase.id} />
          <div className="flex items-center justify-center gap-2 font-semibold text-warn">
            <FlaskConical size={18} /> {t("pay.devTitle")}
          </div>
          <p className="text-sm text-muted">{t("pay.devHint")}</p>
          <button className="btn btn-light" data-testid="simulate-payment">
            {t("pay.devButton")}
          </button>
        </form>
      )}

      <PayStatus
        purchaseId={purchase.id}
        expiresAt={purchase.expiresAt ? purchase.expiresAt.toISOString() : null}
        label={t(purchase.provider === "stripe" ? "pay.cardWaiting" : "pay.waiting")}
      />
      <p className="text-center">
        <Link href={back} className="text-sm text-muted hover:text-text">
          {t("common.cancel")}
        </Link>
      </p>
    </div>
  );
}
