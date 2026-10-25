"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { createTokenAction, type TokenState } from "@/app/actions/studio";
import { useT } from "../i18n";

export function TokenForm() {
  const t = useT();
  const [state, action, pending] = useActionState<TokenState, FormData>(createTokenAction, null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        <input name="name" maxLength={60} placeholder={t("studio.tokenNamePlaceholder")} aria-label={t("studio.tokenName")} className="field sm:max-w-xs" />
        <button className="btn btn-primary" disabled={pending}>
          <KeyRound size={16} /> {t("studio.createToken")}
        </button>
      </form>
      {state?.token && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 p-4">
          <p className="mb-2 text-sm font-medium text-warn">{t("studio.tokenOnce")}</p>
          <div className="flex gap-2">
            <input readOnly value={state.token} className="field font-mono text-xs" data-testid="new-token" onFocus={(event) => event.currentTarget.select()} />
            <button
              type="button"
              className="btn btn-light shrink-0"
              onClick={async () => {
                await navigator.clipboard.writeText(state.token!).catch(() => {});
                setCopied(true);
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
