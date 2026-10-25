import { currentUser } from "@/lib/auth";
import { settlePurchase } from "@/lib/payments";
import { balanceOf, purchaseFor } from "@/lib/wallet";

/**
 * The pay page polls this while a QR is on screen. Each call asks the
 * provider directly, so the page notices a payment even when the webhook is
 * late or never arrives. Only the buyer can see their purchase.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/purchases/[id]">) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthenticated" }, { status: 401 });
  const purchase = await purchaseFor(user.id, (await ctx.params).id);
  if (!purchase) return Response.json({ error: "not_found" }, { status: 404 });
  let status = purchase.status;
  try {
    status = await settlePurchase(purchase);
  } catch (error) {
    console.error("checking a purchase failed", error);
  }
  const balance = status === "paid" ? (await balanceOf(user.id)).total : null;
  return Response.json({ status, balance });
}
