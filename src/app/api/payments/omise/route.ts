import { purchaseByProviderRef, settlePurchase } from "@/lib/payments";

/**
 * Omise's notice that a charge finished — a PromptPay QR was paid, failed or
 * expired. The notice is only a prompt: the charge id in it is looked up in
 * our own purchases, and its status is then fetched from Omise with our
 * secret key, which is what Omise itself recommends. A forged notice can
 * therefore at most make us ask Omise about a charge we already knew.
 */
export async function POST(request: Request) {
  let body: { key?: unknown; data?: { object?: unknown; id?: unknown } };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (body.data?.object !== "charge" || typeof body.data.id !== "string") {
    return Response.json({ ignored: body.key ?? "unknown" });
  }
  const purchase = await purchaseByProviderRef("omise", body.data.id);
  if (!purchase) return Response.json({ ignored: "not ours" });
  try {
    return Response.json({ status: await settlePurchase(purchase) });
  } catch (error) {
    console.error("omise webhook failed", error);
    return Response.json({ error: "Could not check the charge" }, { status: 500 });
  }
}
