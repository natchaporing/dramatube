"use client";

import { useActionState, useState } from "react";
import clsx from "clsx";
import { CreditCard, QrCode } from "lucide-react";
import { startTopUpAction, type TopUpState } from "@/app/actions/wallet";
import type { MessageKey } from "@/lib/i18n";
import { satangToBaht, type Pack } from "@/lib/money";
import { useT } from "../i18n";

export function TopUpForm({
  packs,
  methods,
  returnTo,
}: {
  packs: Pack[];
  methods: { promptpay: boolean; card: boolean };
  returnTo: string | null;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<TopUpState, FormData>(startTopUpAction, null);
  const [packId, setPackId] = useState(packs.find((pack) => pack.id === "regular")?.id ?? packs[0]?.id);
  const [method, setMethod] = useState<"promptpay" | "card">(methods.promptpay ? "promptpay" : "card");
  const chosen = packs.find((pack) => pack.id === packId);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="packId" value={packId} />
      <input type="hidden" name="method" value={method} />
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {packs.map((pack) => {
          const total = pack.credits + pack.bonus;
          return (
            <button
              type="button"
              key={pack.id}
              onClick={() => setPackId(pack.id)}
              aria-pressed={pack.id === packId}
              className={clsx(
                "relative flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition-colors",
                pack.id === packId ? "border-brand bg-brand-dim/40" : "border-line bg-surface hover:border-line-bright",
              )}
            >
              {pack.firstOnly && (
                <span className="absolute -top-2.5 right-3 rounded-full bg-warn px-2 py-0.5 text-[11px] font-semibold text-ground">
                  {t("wallet.firstOffer")}
                </span>
              )}
              <span className="text-2xl font-bold text-text tabular-nums">{total.toLocaleString()}</span>
              <span className="text-xs text-muted">
                {t("wallet.episodes", { count: Math.floor(total / 30) })}
                {pack.bonus > 0 && <span className="ml-1 text-warn">{t("wallet.bonus", { bonus: pack.bonus })}</span>}
              </span>
              <span className="mt-2 text-base font-semibold text-text">{satangToBaht(pack.priceSatang)}</span>
              <span className="text-[11px] text-faint">
                {pack.firstOnly ? t("wallet.firstOfferHint") : t("wallet.perEpisode", { price: satangToBaht(Math.round((pack.priceSatang * 30) / total)) })}
              </span>
            </button>
          );
        })}
      </div>

      <fieldset>
        <legend className="label">{t("wallet.method")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["promptpay", "card"] as const).map((value) => (
            <button
              type="button"
              key={value}
              disabled={!methods[value]}
              onClick={() => setMethod(value)}
              aria-pressed={method === value}
              className={clsx(
                "flex items-center gap-3 rounded-xl border-2 p-4 text-left disabled:cursor-not-allowed disabled:opacity-40",
                method === value ? "border-brand bg-brand-dim/40" : "border-line bg-surface hover:border-line-bright",
              )}
            >
              {value === "promptpay" ? <QrCode size={24} /> : <CreditCard size={24} />}
              <span>
                <span className="block font-semibold text-text">{t(value === "promptpay" ? "wallet.promptpay" : "wallet.card")}</span>
                <span className="block text-xs text-muted">{t(value === "promptpay" ? "wallet.promptpayHint" : "wallet.cardHint")}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {state?.error && (
        <p className="rounded-md bg-bad-dim px-3 py-2 text-sm text-bad" role="alert">
          {t(`wallet.error.${state.error}` as MessageKey)}
        </p>
      )}
      {returnTo && <p className="text-xs text-muted">{t("wallet.returning")}</p>}
      <button className="btn btn-primary w-full py-3 text-base sm:w-auto sm:px-10" disabled={pending || !chosen}>
        {chosen ? t("wallet.buy", { price: satangToBaht(chosen.priceSatang) }) : "…"}
      </button>
    </form>
  );
}
