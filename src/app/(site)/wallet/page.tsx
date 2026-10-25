import { Coins } from "lucide-react";
import { SignInWall } from "@/components/sign-in-wall";
import { TopUpForm } from "@/components/wallet/top-up-form";
import { formatDate } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import { PACKS } from "@/lib/money";
import { expireStalePurchases, providers } from "@/lib/payments";
import { safeNext } from "@/lib/safe-next";
import { pageContext } from "@/lib/viewer";
import { balanceOf, firstTopUpAvailable, ledgerOf } from "@/lib/wallet";

export const metadata = { title: "Wallet" };

export default async function WalletPage({ searchParams }: PageProps<"/wallet">) {
  const params = await searchParams;
  const { user, t, locale } = await pageContext();
  if (!user) return <SignInWall title={t("wallet.title")} next="/wallet" />;
  void expireStalePurchases().catch(() => {});
  const [balance, history, firstOk] = await Promise.all([balanceOf(user.id), ledgerOf(user.id), firstTopUpAvailable(user.id)]);
  const available = providers();
  const methods = { promptpay: Boolean(available.promptpay), card: Boolean(available.card) };
  const packs = PACKS.filter((pack) => !pack.firstOnly || firstOk);
  const returnTo = typeof params.return === "string" ? safeNext(params.return, "") || null : null;

  return (
    <div className="mx-auto max-w-[900px] space-y-10 px-4 py-6 sm:px-6">
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-surface p-6">
        <div>
          <h1 className="text-sm font-medium text-muted">{t("wallet.balance")}</h1>
          <div className="mt-1 flex items-center gap-2 text-4xl font-bold text-text tabular-nums" data-testid="wallet-balance">
            <Coins size={30} className="text-warn" />
            {balance.total.toLocaleString()}
          </div>
          {balance.bonus > 0 && balance.bonusExpiresAt && (
            <p className="mt-2 text-sm text-muted">
              {t("wallet.bonusNote", { bonus: balance.bonus, date: formatDate(balance.bonusExpiresAt, locale) })}
            </p>
          )}
        </div>
        <p className="max-w-xs text-xs text-faint">{t("wallet.expiryRule")}</p>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold text-text">{t("wallet.packsTitle")}</h2>
        {methods.promptpay || methods.card ? (
          <TopUpForm packs={packs} methods={methods} returnTo={returnTo} />
        ) : (
          <p className="rounded-xl bg-surface p-6 text-muted">{t("wallet.unavailable")}</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-text">{t("wallet.history")}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">{t("wallet.noHistory")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {history.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="text-text">{t(`wallet.reason.${row.reason}` as MessageKey)}{row.note ? ` · ${row.note}` : ""}</div>
                  <div className="text-xs text-faint">{formatDate(row.createdAt, locale)}</div>
                </div>
                <span className={`font-mono tabular-nums ${row.delta >= 0 ? "text-good" : "text-text"}`}>
                  {row.delta >= 0 ? "+" : ""}
                  {row.delta.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
