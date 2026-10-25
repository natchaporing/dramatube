"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { applySellerAction, requestPayoutAction, type MoneyFormState } from "@/app/actions/money";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "../i18n";
import { keepFields } from "./keep-fields";

export function SellerForm({
  initial,
  reapply,
}: {
  initial: { legalName: string; promptpayId: string; birthDate: string } | null;
  reapply: boolean;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<MoneyFormState, FormData>(applySellerAction, null);
  return (
    <form onSubmit={keepFields(action)} className="grid gap-4 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className="label">{t("seller.legalName")}</span>
        <input name="legalName" required maxLength={120} defaultValue={initial?.legalName} className="field" autoComplete="name" />
      </label>
      <label className="block">
        <span className="label">{t("seller.promptpay")}</span>
        <input name="promptpayId" required inputMode="numeric" maxLength={17} defaultValue={initial?.promptpayId} className="field font-mono" />
        <span className="hint block">{t("seller.promptpayHint")}</span>
      </label>
      <label className="block">
        <span className="label">{t("seller.birthDate")}</span>
        <input name="birthDate" type="date" required defaultValue={initial?.birthDate} className="field" />
      </label>
      {state?.error && (
        <p className="text-sm text-bad sm:col-span-2" role="alert">
          {t(`seller.error.${state.error}` as MessageKey)}
        </p>
      )}
      <div className="sm:col-span-2">
        <button className="btn btn-primary" disabled={pending} data-testid="apply-seller">
          {t(reapply ? "seller.reapply" : "seller.apply")}
        </button>
      </div>
    </form>
  );
}

export function PayoutButton({ label, disabled }: { label: string; disabled: boolean }) {
  const t = useT();
  const [state, action, pending] = useActionState<MoneyFormState>(requestPayoutAction, null);
  return (
    <form action={action} className="space-y-2">
      <button className="btn btn-primary" disabled={disabled || pending}>
        {label}
      </button>
      {state?.ok && <p className="text-sm text-good">{t("earn.requestedOk")}</p>}
      {state?.error && (
        <p className="text-sm text-bad" role="alert">
          {t(`earn.error.${state.error}` as MessageKey)}
        </p>
      )}
    </form>
  );
}

export function ShareLink({ link }: { link: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={link} className="field font-mono text-xs" onFocus={(event) => event.currentTarget.select()} data-testid="channel-share-link" />
      <button
        type="button"
        className="btn btn-ghost shrink-0"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          } catch {
            /* the field is selectable */
          }
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {t(copied ? "earn.copied" : "earn.copy")}
      </button>
    </div>
  );
}
