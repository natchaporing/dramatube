"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentUser, requireAdmin, requireUser } from "@/lib/auth";
import { SellerError, applyToSell, markPayoutPaid, rejectPayout, requestPayout, reviewSeller } from "@/lib/earnings";
import { REF_COOKIE, readRefCookie } from "@/lib/referral";
import { StudioError, updateSeriesPricing } from "@/lib/studio";
import { InsufficientCredits, UnlockError, unlockEpisode, unlockRest } from "@/lib/unlock";
import { balanceOf } from "@/lib/wallet";

/*
 * Every action re-checks who is asking: a Server Action is a public POST
 * endpoint whatever button it was written for.
 */

export type UnlockResult =
  | { ok: true }
  | { error: "signin" | "not_found" | "not_locked" | "nothing_left" | "price_changed" }
  | { error: "insufficient"; needed: number; balance: number };

async function refs() {
  return readRefCookie((await cookies()).get(REF_COOKIE)?.value);
}

async function unlockWith(run: (userId: string) => Promise<unknown>, path: string): Promise<UnlockResult> {
  const user = await currentUser();
  if (!user) return { error: "signin" };
  try {
    await run(user.id);
  } catch (error) {
    if (error instanceof InsufficientCredits) {
      return { error: "insufficient", needed: error.needed, balance: (await balanceOf(user.id)).total };
    }
    if (error instanceof UnlockError) return { error: error.code };
    throw error;
  }
  revalidatePath(path);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** `price` is what the button said; the sale goes through only at that price. */
export async function unlockEpisodeAction(videoId: string, price: number): Promise<UnlockResult> {
  const map = await refs();
  return unlockWith((userId) => unlockEpisode(userId, String(videoId), map, Number(price)), `/watch/${videoId}`);
}

/** `expected` is what the button offered: these episodes, for this total. */
export async function unlockRestAction(seriesId: string, videoId: string, expected: { ids: string[]; total: number }): Promise<UnlockResult> {
  const map = await refs();
  const ids = Array.isArray(expected?.ids) ? expected.ids.map(String).slice(0, 500) : [];
  return unlockWith((userId) => unlockRest(userId, String(seriesId), map, { ids, total: Number(expected?.total) }), `/watch/${videoId}`);
}

export type MoneyFormState = { error?: string; ok?: number } | null;

export async function applySellerAction(_prev: MoneyFormState, form: FormData): Promise<MoneyFormState> {
  const user = await requireUser();
  try {
    await applyToSell(user.id, {
      legalName: String(form.get("legalName") ?? ""),
      promptpayId: String(form.get("promptpayId") ?? ""),
      birthDate: String(form.get("birthDate") ?? ""),
    });
  } catch (error) {
    if (error instanceof SellerError) return { error: error.code };
    throw error;
  }
  revalidatePath("/studio/earnings");
  return { ok: Date.now() };
}

export async function requestPayoutAction(_prev: MoneyFormState): Promise<MoneyFormState> {
  const user = await requireUser();
  try {
    await requestPayout(user.id);
  } catch (error) {
    if (error instanceof SellerError) return { error: error.code };
    throw error;
  }
  revalidatePath("/studio/earnings");
  return { ok: Date.now() };
}

export async function updatePricingAction(_prev: MoneyFormState, form: FormData): Promise<MoneyFormState> {
  const user = await requireUser();
  try {
    await updateSeriesPricing(user.id, String(form.get("seriesId") ?? ""), {
      onSale: form.get("onSale") === "on",
      freeEpisodes: Number(form.get("freeEpisodes")),
      episodePrice: Number(form.get("episodePrice")),
      seriesPricePercent: Number(form.get("seriesPricePercent")),
      exclusive: form.get("exclusive") === "on",
    });
  } catch (error) {
    if (error instanceof StudioError) return { error: error.message };
    throw error;
  }
  revalidatePath("/studio/series");
  return { ok: Date.now() };
}

export async function reviewSellerAction(form: FormData) {
  await requireAdmin();
  await reviewSeller(String(form.get("userId") ?? ""), form.get("decision") === "approve", String(form.get("note") ?? ""));
  revalidatePath("/admin");
}

export async function markPayoutPaidAction(form: FormData) {
  await requireAdmin();
  await markPayoutPaid(String(form.get("payoutId") ?? ""), String(form.get("reference") ?? ""));
  revalidatePath("/admin");
}

export async function rejectPayoutAction(form: FormData) {
  await requireAdmin();
  await rejectPayout(String(form.get("payoutId") ?? ""), String(form.get("note") ?? ""));
  revalidatePath("/admin");
}
