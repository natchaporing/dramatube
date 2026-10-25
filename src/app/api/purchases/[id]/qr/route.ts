import { currentUser } from "@/lib/auth";
import { omiseQrImage } from "@/lib/payments";
import { purchaseFor } from "@/lib/wallet";

/** The PromptPay QR for one of the viewer's own purchases, fetched from Omise with our key. */
export async function GET(_request: Request, ctx: RouteContext<"/api/purchases/[id]/qr">) {
  const user = await currentUser();
  if (!user) return new Response("Unauthenticated", { status: 401 });
  const purchase = await purchaseFor(user.id, (await ctx.params).id);
  if (!purchase?.qrImageUrl || purchase.status !== "pending") return new Response("Not found", { status: 404 });
  try {
    const image = await omiseQrImage(purchase.qrImageUrl);
    return new Response(image.body, { headers: { "Content-Type": image.type, "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("QR download failed", error);
    return new Response("QR unavailable", { status: 502 });
  }
}
