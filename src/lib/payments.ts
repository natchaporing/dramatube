import Stripe from "stripe";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { uniqueViolation } from "@/db/errors";
import { purchases, type Purchase } from "@/db/schema";
import { newId } from "./ids";
import { packById } from "./money";
import { reversePurchase } from "./refunds";
import { firstTopUpAvailable, grantPurchase } from "./wallet";

/**
 * Taking money: PromptPay through Omise, cards through Stripe — the hybrid.
 *
 * PromptPay is how Thailand pays and Omise charges a percentage for it where
 * Stripe's QR fee is fixed per payment, which on a ฿19 pack is most of the
 * pack. Cards go through Stripe Checkout, which handles 3-D Secure and never
 * lets a card number near this server. Either half falls back to the other:
 * with no Omise key Stripe takes PromptPay too, and with neither the wallet
 * says top-ups are not set up rather than showing buttons that cannot work.
 *
 * `ALLOW_DEV_PAYMENTS=1` adds a stand-in that marks a purchase paid at the
 * press of a button, so the whole flow can be exercised without a gateway.
 * It is for development and the e2e check only; never set it in production.
 *
 * Whatever a provider says, the credits granted are the ones on the purchase
 * row, written before the viewer was sent to pay — and a payment is only
 * believed after asking the provider directly, never on a webhook's word.
 */

export type Method = "promptpay" | "card";
export type Provider = Purchase["provider"];

const read = (name: string) => process.env[name]?.trim() || undefined;

const config = {
  get omiseSecret() {
    return read("OMISE_SECRET_KEY");
  },
  get stripeSecret() {
    return read("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return read("STRIPE_WEBHOOK_SECRET");
  },
  get devPayments() {
    return read("ALLOW_DEV_PAYMENTS") === "1";
  },
};

/** Which provider takes each method on this installation, or null if none does. */
export function providers(): Record<Method, Provider | null> {
  const stripeReady = Boolean(config.stripeSecret && config.stripeWebhookSecret);
  return {
    promptpay: config.omiseSecret ? "omise" : stripeReady ? "stripe" : config.devPayments ? "dev" : null,
    card: stripeReady ? "stripe" : config.devPayments ? "dev" : null,
  };
}

export class PaymentError extends Error {
  constructor(public readonly code: "unavailable" | "unknown_pack" | "first_used" | "provider") {
    super(code);
  }
}

let stripeClient: Stripe | null = null;
function stripe(): Stripe {
  if (!config.stripeSecret) throw new PaymentError("unavailable");
  stripeClient ??= new Stripe(config.stripeSecret);
  return stripeClient;
}

/* ---------------------------- Omise ---------------------------------- */

const OMISE_API = "https://api.omise.co";

interface OmiseCharge {
  object: "charge";
  id: string;
  status: "pending" | "successful" | "failed" | "expired" | "reversed";
  paid: boolean;
  amount: number;
  currency: string;
  expires_at?: string | null;
  source?: { scannable_code?: { image?: { download_uri?: string } } } | null;
}

async function omise<T>(path: string, init?: { method?: string; form?: Record<string, string> }): Promise<T> {
  if (!config.omiseSecret) throw new PaymentError("unavailable");
  const response = await fetch(`${OMISE_API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.omiseSecret}:`).toString("base64")}`,
      ...(init?.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: init?.form ? new URLSearchParams(init.form).toString() : undefined,
  });
  const body = (await response.json()) as T & { object?: string; message?: string };
  if (!response.ok || body.object === "error") {
    throw new Error(`Omise ${path} failed: ${response.status} ${body.message ?? ""}`);
  }
  return body;
}

/** The QR image for a PromptPay charge, fetched with our key so it works whether or not the link is public. */
export async function omiseQrImage(qrUrl: string): Promise<{ body: ArrayBuffer; type: string }> {
  if (!config.omiseSecret) throw new PaymentError("unavailable");
  if (!qrUrl.startsWith(`${OMISE_API}/`)) throw new Error("not an Omise document URL");
  const response = await fetch(qrUrl, {
    headers: { Authorization: `Basic ${Buffer.from(`${config.omiseSecret}:`).toString("base64")}` },
  });
  if (!response.ok) throw new Error(`QR download failed: ${response.status}`);
  return { body: await response.arrayBuffer(), type: response.headers.get("content-type") ?? "image/svg+xml" };
}

/* ---------------------------- Starting -------------------------------- */

export interface Started {
  purchase: Purchase;
  /** Stripe: where to send the viewer. Others: our own pay page. */
  redirectTo: string;
}

/**
 * A first-top-up checkout this viewer started and has not finished. Asks the
 * provider first, so one paid or expired a moment ago does not count. If it
 * is still open, the viewer is sent back to it rather than given a second.
 */
async function openFirstPurchase(userId: string, origin: string): Promise<Started | null> {
  const [pending] = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.packId, "first"), eq(purchases.status, "pending")))
    .limit(1);
  if (!pending) return null;
  const payPage = `${origin}/wallet/pay/${pending.id}`;
  try {
    if ((await settlePurchase(pending)) !== "pending") return null;
    if (pending.provider === "stripe" && pending.providerRef) {
      const session = await stripe().checkout.sessions.retrieve(pending.providerRef);
      if (session.status === "open" && session.url) return { purchase: pending, redirectTo: session.url };
    }
  } catch (error) {
    // The provider did not answer: the pay page asks again.
    console.error("checking an open first top-up failed", error);
  }
  return { purchase: pending, redirectTo: payPage };
}

export async function startPurchase(opts: {
  userId: string;
  email: string;
  packId: string;
  method: Method;
  origin: string;
  returnTo: string | null;
}): Promise<Started> {
  const pack = packById(opts.packId);
  if (!pack) throw new PaymentError("unknown_pack");
  const provider = providers()[opts.method];
  if (!provider) throw new PaymentError("unavailable");
  if (pack.firstOnly) {
    const open = await openFirstPurchase(opts.userId, opts.origin);
    if (open) return open;
    if (!(await firstTopUpAvailable(opts.userId))) throw new PaymentError("first_used");
  }

  const id = newId("pur");
  try {
    await db.insert(purchases).values({
      id,
      userId: opts.userId,
      packId: pack.id,
      credits: pack.credits,
      bonusCredits: pack.bonus,
      amountSatang: pack.priceSatang,
      method: opts.method,
      provider,
      returnTo: opts.returnTo,
    });
  } catch (error) {
    // Two tabs asking for the first top-up at once: the index lets one through.
    if (uniqueViolation(error) === "purchases_first_pack_idx") throw new PaymentError("first_used");
    throw error;
  }
  const payPage = `${opts.origin}/wallet/pay/${id}`;
  const description = `DramaTube credits: ${pack.credits + pack.bonus}`;

  try {
    if (provider === "omise") {
      const charge = await omise<OmiseCharge>("/charges", {
        method: "POST",
        form: {
          amount: String(pack.priceSatang),
          currency: "thb",
          "source[type]": "promptpay",
          description,
          "metadata[purchase_id]": id,
        },
      });
      const [updated] = await db
        .update(purchases)
        .set({
          providerRef: charge.id,
          qrImageUrl: charge.source?.scannable_code?.image?.download_uri ?? null,
          expiresAt: charge.expires_at ? new Date(charge.expires_at) : new Date(Date.now() + 15 * 60_000),
        })
        .where(eq(purchases.id, id))
        .returning();
      return { purchase: updated, redirectTo: payPage };
    }

    if (provider === "stripe") {
      // Thirty minutes, Stripe's shortest, rather than its default day: an
      // abandoned first-top-up checkout holds the offer until it expires.
      const expiresAt = new Date(Date.now() + 30 * 60_000);
      const session = await stripe().checkout.sessions.create({
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        mode: "payment",
        payment_method_types: [opts.method === "promptpay" ? "promptpay" : "card"],
        line_items: [
          {
            quantity: 1,
            price_data: { currency: "thb", unit_amount: pack.priceSatang, product_data: { name: description } },
          },
        ],
        customer_email: opts.email,
        client_reference_id: id,
        metadata: { purchase_id: id },
        success_url: payPage,
        cancel_url: `${opts.origin}/wallet`,
      });
      const [updated] = await db
        .update(purchases)
        .set({ providerRef: session.id, expiresAt })
        .where(eq(purchases.id, id))
        .returning();
      return { purchase: updated, redirectTo: session.url ?? payPage };
    }

    // dev
    const [updated] = await db
      .update(purchases)
      .set({ providerRef: `dev_${id}`, expiresAt: new Date(Date.now() + 15 * 60_000) })
      .where(eq(purchases.id, id))
      .returning();
    return { purchase: updated, redirectTo: payPage };
  } catch (error) {
    await db.update(purchases).set({ status: "failed" }).where(eq(purchases.id, id));
    if (error instanceof PaymentError) throw error;
    console.error("starting a payment failed", error);
    throw new PaymentError("provider");
  }
}

/* ---------------------------- Settling -------------------------------- */

/**
 * Grant a payment the provider confirmed, and say what the purchase is now.
 * Less money than the pack costs is not a sale: the purchase is marked failed
 * for a person to look at, and no credits are granted.
 */
async function granted(purchase: Purchase, paidSatang: number): Promise<Purchase["status"]> {
  const result = await grantPurchase(purchase.id, paidSatang);
  if (result === "granted") return "paid";
  if (result === "mismatch") {
    console.error(`purchase ${purchase.id}: paid ${paidSatang} satang of ${purchase.amountSatang}`);
    await db.update(purchases).set({ status: "failed" }).where(and(eq(purchases.id, purchase.id), eq(purchases.status, "pending")));
    return "failed";
  }
  const [row] = await db.select({ status: purchases.status }).from(purchases).where(eq(purchases.id, purchase.id)).limit(1);
  return row?.status ?? purchase.status;
}

/**
 * Ask the provider what happened to a purchase and act on it. Safe to call
 * any number of times from anywhere: the grant happens once.
 */
export async function settlePurchase(purchase: Purchase): Promise<Purchase["status"]> {
  if (purchase.status !== "pending" && purchase.status !== "expired") return purchase.status;
  if (!purchase.providerRef) return purchase.status;

  if (purchase.provider === "omise") {
    const charge = await omise<OmiseCharge>(`/charges/${encodeURIComponent(purchase.providerRef)}`);
    if (charge.status === "successful" && charge.paid && charge.currency.toLowerCase() === "thb") {
      return granted(purchase, charge.amount);
    }
    if (charge.status === "failed" || charge.status === "expired") {
      await db.update(purchases).set({ status: charge.status }).where(and(eq(purchases.id, purchase.id), eq(purchases.status, "pending")));
      return charge.status;
    }
    return "pending";
  }

  if (purchase.provider === "stripe") {
    const session = await stripe().checkout.sessions.retrieve(purchase.providerRef);
    if (session.payment_status === "paid" && session.currency === "thb") {
      return granted(purchase, session.amount_total ?? 0);
    }
    if (session.status === "expired") {
      await db.update(purchases).set({ status: "expired" }).where(and(eq(purchases.id, purchase.id), eq(purchases.status, "pending")));
      return "expired";
    }
    return "pending";
  }

  // dev purchases are only settled by the simulate button.
  if (purchase.expiresAt && purchase.expiresAt < new Date()) {
    await db.update(purchases).set({ status: "expired" }).where(and(eq(purchases.id, purchase.id), eq(purchases.status, "pending")));
    return "expired";
  }
  return "pending";
}

/** The stand-in provider's "the customer paid" button. Refuses unless enabled. */
export async function simulateDevPayment(purchase: Purchase) {
  if (!config.devPayments || purchase.provider !== "dev") throw new PaymentError("unavailable");
  return granted(purchase, purchase.amountSatang);
}

export async function purchaseByProviderRef(provider: Provider, ref: string) {
  const [row] = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.provider, provider), eq(purchases.providerRef, ref)))
    .limit(1);
  return row ?? null;
}

/* ---------------------------- Webhooks -------------------------------- */

/** Stripe's signature over the raw body, checked before anything is parsed. */
export function verifyStripeEvent(payload: string, signature: string): Stripe.Event {
  if (!config.stripeWebhookSecret) throw new PaymentError("unavailable");
  return stripe().webhooks.constructEvent(payload, signature, config.stripeWebhookSecret);
}

/** Money that went back on a card: find the purchase through its session and take back what is unspent. */
export async function reverseStripePayment(paymentIntentId: string, why: "refund" | "dispute") {
  const sessions = await stripe().checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
  const session = sessions.data[0];
  if (!session) return null;
  const purchase = await purchaseByProviderRef("stripe", session.id);
  if (!purchase) return null;
  return reversePurchase(purchase.id, why);
}

/** Abandoned checkouts older than a day stop reading as in flight. */
export async function expireStalePurchases() {
  await db
    .update(purchases)
    .set({ status: "expired" })
    .where(and(eq(purchases.status, "pending"), lt(purchases.createdAt, new Date(Date.now() - 24 * 3_600_000))));
}
