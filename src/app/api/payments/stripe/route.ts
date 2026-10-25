import type Stripe from "stripe";
import { PaymentError, purchaseByProviderRef, reverseStripePayment, settlePurchase, verifyStripeEvent } from "@/lib/payments";
import { db } from "@/db";
import { purchases } from "@/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Stripe's word that something happened to a card or PromptPay payment.
 *
 * Public, unauthenticated, and it leads to credits, so: the signature is
 * checked over the raw bytes before anything is parsed; the purchase must be
 * one this installation started; and the payment is then confirmed by asking
 * Stripe for the session rather than trusting the event's copy of it. A
 * rejection answers 4xx so Stripe stops; a failure of ours answers 5xx so it
 * tries again, which the once-only grant makes safe.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "No signature" }, { status: 400 });
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = verifyStripeEvent(payload, signature);
  } catch (error) {
    if (error instanceof PaymentError) return Response.json({ error: "Stripe is not configured" }, { status: 400 });
    return Response.json({ error: "Bad signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const purchase = await purchaseByProviderRef("stripe", event.data.object.id);
        if (!purchase) return Response.json({ error: "Unrecognised session" }, { status: 400 });
        if (event.type === "checkout.session.async_payment_failed") {
          await db.update(purchases).set({ status: "failed" }).where(and(eq(purchases.id, purchase.id), eq(purchases.status, "pending")));
          return Response.json({ failed: purchase.id });
        }
        return Response.json({ status: await settlePurchase(purchase) });
      }
      case "charge.refunded":
      case "charge.dispute.created": {
        const charge = event.data.object as Stripe.Charge | Stripe.Dispute;
        const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (!intent) return Response.json({ ignored: "no payment intent" });
        const result = await reverseStripePayment(intent, event.type === "charge.refunded" ? "refund" : "dispute");
        return Response.json({ reversed: result });
      }
      default:
        return Response.json({ ignored: event.type });
    }
  } catch (error) {
    console.error("stripe webhook failed", error);
    return Response.json({ error: "Could not process the event" }, { status: 500 });
  }
}
