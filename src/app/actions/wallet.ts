"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { siteOrigin } from "@/lib/origin-server";
import { PaymentError, simulateDevPayment, startPurchase, type Method } from "@/lib/payments";
import { safeNext } from "@/lib/safe-next";
import { purchaseFor } from "@/lib/wallet";

export type TopUpState = { error?: string } | null;

export async function startTopUpAction(_prev: TopUpState, form: FormData): Promise<TopUpState> {
  const user = await requireUser();
  const method = form.get("method") === "card" ? "card" : ("promptpay" as Method);
  const back = form.get("returnTo");
  let destination: string;
  try {
    const started = await startPurchase({
      userId: user.id,
      email: user.email,
      packId: String(form.get("packId") ?? ""),
      method,
      origin: await siteOrigin(),
      returnTo: typeof back === "string" && back ? safeNext(back) : null,
    });
    destination = started.redirectTo;
  } catch (error) {
    if (error instanceof PaymentError) return { error: error.code };
    throw error;
  }
  redirect(destination);
}

export async function simulatePaymentAction(form: FormData) {
  const user = await requireUser();
  const purchase = await purchaseFor(user.id, String(form.get("purchaseId") ?? ""));
  if (!purchase) return;
  await simulateDevPayment(purchase);
  revalidatePath("/", "layout");
}
