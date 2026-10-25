"use client";

import { useActionState } from "react";
import { signInAction, signUpAction, type AuthState } from "@/app/actions/auth";
import { useT } from "@/components/i18n";
import type { MessageKey } from "@/lib/i18n";

export function AuthForm({ mode, next }: { mode: "signin" | "signup"; next: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "signup" ? signUpAction : signInAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {mode === "signup" && (
        <>
          <label className="block">
            <span className="label">{t("auth.name")}</span>
            <input name="name" required maxLength={60} defaultValue={state?.name} className="field" autoComplete="nickname" />
          </label>
          <label className="block">
            <span className="label">{t("auth.handle")}</span>
            <div className="flex items-center rounded-md border border-line bg-surface focus-within:border-line-bright">
              <span className="pl-3 text-sm text-faint">@</span>
              <input
                name="handle"
                maxLength={30}
                defaultValue={state?.handle}
                pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,29}"
                className="w-full bg-transparent px-1 py-2 text-sm text-text focus:outline-none"
                autoComplete="username"
              />
            </div>
            <span className="hint block">{t("auth.handleHint")}</span>
          </label>
        </>
      )}
      <label className="block">
        <span className="label">{t("auth.email")}</span>
        <input name="email" type="email" required defaultValue={state?.email} className="field" autoComplete="email" />
      </label>
      <label className="block">
        <span className="label">{t("auth.password")}</span>
        <input
          name="password"
          type="password"
          required
          minLength={mode === "signup" ? 8 : undefined}
          className="field"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
      </label>
      {state?.error && (
        <p className="rounded-md bg-bad-dim px-3 py-2 text-sm text-bad" role="alert">
          {t(`auth.error.${state.error}` as MessageKey)}
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={pending}>
        {t(mode === "signup" ? "auth.signUp" : "auth.signIn")}
      </button>
    </form>
  );
}
