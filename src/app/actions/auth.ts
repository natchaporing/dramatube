"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSession, destroySession } from "@/lib/auth";
import { AccountError, authenticate, registerUser } from "@/lib/session";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n";
import { safeNext } from "@/lib/safe-next";

export type AuthState = { error?: string; email?: string; name?: string; handle?: string } | null;

export async function signInAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "");
  const user = await authenticate(email, String(form.get("password") ?? ""));
  if (!user) return { error: "credentials", email };
  await createSession(user.id);
  redirect(safeNext(form.get("next")));
}

export async function signUpAction(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "");
  const name = String(form.get("name") ?? "");
  const handle = String(form.get("handle") ?? "");
  try {
    const user = await registerUser({ email, name, handle, password: String(form.get("password") ?? "") });
    await createSession(user.id);
  } catch (error) {
    if (error instanceof AccountError) return { error: error.code, email, name, handle };
    throw error;
  }
  redirect(safeNext(form.get("next")));
}

export async function signOutAction() {
  await destroySession();
  redirect("/");
}

export async function setLanguageAction(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
