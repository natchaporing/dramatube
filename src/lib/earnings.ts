import { and, desc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { creditLedger, earnings, payouts, sellers, unlocks, users, videos } from "@/db/schema";
import { newId } from "./ids";
import { MIN_PAYOUT_CREDITS, PAYOUT_SATANG_PER_CREDIT, SELLER_MIN_AGE, ageOn, normalizePromptPay } from "./money";
import { returnCredits } from "./wallet";

/**
 * The creator's side: what they have earned, what they can take out, and
 * the seller verification that has to come first. Earnings are held for 14
 * days — the refund window — then can be cashed out by PromptPay from ฿500.
 */

export async function earningsSummary(creatorId: string, now = new Date()) {
  // Inside a hand-written fragment a Date is not converted by the driver; pass it as text and cast.
  const at = sql`${now.toISOString()}::timestamptz`;
  const [row] = await db
    .select({
      available: sql<number>`coalesce(sum(${earnings.credits}) filter (where ${earnings.status} = 'open' and ${earnings.payoutId} is null and ${earnings.availableAt} <= ${at}), 0)::int`,
      held: sql<number>`coalesce(sum(${earnings.credits}) filter (where ${earnings.status} = 'open' and ${earnings.payoutId} is null and ${earnings.availableAt} > ${at}), 0)::int`,
      requested: sql<number>`coalesce(sum(${earnings.credits}) filter (where ${earnings.status} = 'open' and ${earnings.payoutId} is not null), 0)::int`,
      paid: sql<number>`coalesce(sum(${earnings.credits}) filter (where ${earnings.status} = 'paid'), 0)::int`,
      direct: sql<number>`count(*) filter (where ${earnings.attribution} = 'direct' and ${earnings.status} <> 'reversed')::int`,
      discovered: sql<number>`count(*) filter (where ${earnings.attribution} = 'discovered' and ${earnings.status} <> 'reversed')::int`,
    })
    .from(earnings)
    .where(eq(earnings.creatorId, creatorId));
  return row;
}

export async function recentSales(creatorId: string, limit = 50) {
  return db
    .select({
      id: earnings.id,
      credits: earnings.credits,
      attribution: earnings.attribution,
      availableAt: earnings.availableAt,
      status: earnings.status,
      createdAt: earnings.createdAt,
      videoId: earnings.videoId,
      title: videos.title,
      episodeNumber: videos.episodeNumber,
    })
    .from(earnings)
    .leftJoin(videos, eq(videos.id, earnings.videoId))
    .where(eq(earnings.creatorId, creatorId))
    .orderBy(desc(earnings.createdAt))
    .limit(limit);
}

export async function payoutsOf(creatorId: string) {
  return db.select().from(payouts).where(eq(payouts.creatorId, creatorId)).orderBy(desc(payouts.requestedAt)).limit(24);
}

/* ---------------------------- Sellers ---------------------------------- */

export class SellerError extends Error {
  constructor(public readonly code: "name" | "promptpay" | "birth" | "age" | "not_seller" | "below_minimum" | "pending_payout") {
    super(code);
  }
}

export async function sellerOf(userId: string) {
  const [row] = await db.select().from(sellers).where(eq(sellers.userId, userId)).limit(1);
  return row ?? null;
}

/** Apply, or re-apply after a rejection or to correct details. Always back to pending. */
export async function applyToSell(userId: string, input: { legalName: string; promptpayId: string; birthDate: string }) {
  const legalName = input.legalName.replace(/\s+/g, " ").trim().slice(0, 120);
  if (legalName.length < 3 || !legalName.includes(" ")) throw new SellerError("name");
  const promptpayId = normalizePromptPay(input.promptpayId);
  if (!promptpayId) throw new SellerError("promptpay");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate) || Number.isNaN(Date.parse(input.birthDate))) throw new SellerError("birth");
  if (ageOn(input.birthDate) < SELLER_MIN_AGE) throw new SellerError("age");
  await db
    .insert(sellers)
    .values({ userId, legalName, promptpayId, birthDate: input.birthDate, status: "pending" })
    .onConflictDoUpdate({
      target: sellers.userId,
      set: { legalName, promptpayId, birthDate: input.birthDate, status: "pending", note: "", appliedAt: new Date(), reviewedAt: null },
    });
}

export async function pendingSellers() {
  return db
    .select({ seller: sellers, handle: users.handle, name: users.name, email: users.email })
    .from(sellers)
    .innerJoin(users, eq(users.id, sellers.userId))
    .where(eq(sellers.status, "pending"))
    .orderBy(sellers.appliedAt);
}

export async function reviewSeller(userId: string, approve: boolean, note: string) {
  await db
    .update(sellers)
    .set({ status: approve ? "approved" : "rejected", note: note.trim().slice(0, 300), reviewedAt: new Date() })
    .where(eq(sellers.userId, userId));
}

/* ---------------------------- Payouts ---------------------------------- */

/**
 * Claim every available earning into one payout request, at ฿0.30 a credit.
 * The PromptPay number and name are copied onto the payout, so changing them
 * afterwards cannot redirect money already asked for.
 */
export async function requestPayout(creatorId: string) {
  const seller = await sellerOf(creatorId);
  if (!seller || seller.status !== "approved") throw new SellerError("not_seller");
  return db.transaction(async (tx) => {
    const [open] = await tx
      .select({ id: payouts.id })
      .from(payouts)
      .where(and(eq(payouts.creatorId, creatorId), eq(payouts.status, "requested")))
      .limit(1);
    if (open) throw new SellerError("pending_payout");
    const rows = await tx
      .select({ id: earnings.id, credits: earnings.credits })
      .from(earnings)
      .where(and(eq(earnings.creatorId, creatorId), eq(earnings.status, "open"), isNull(earnings.payoutId), lte(earnings.availableAt, new Date())))
      .for("update");
    const credits = rows.reduce((sum, row) => sum + row.credits, 0);
    if (credits < MIN_PAYOUT_CREDITS) throw new SellerError("below_minimum");
    const id = newId("pay");
    await tx.insert(payouts).values({
      id,
      creatorId,
      credits,
      amountSatang: credits * PAYOUT_SATANG_PER_CREDIT,
      promptpayId: seller.promptpayId,
      legalName: seller.legalName,
    });
    await tx.update(earnings).set({ payoutId: id }).where(inArray(earnings.id, rows.map((row) => row.id)));
    return id;
  });
}

export async function requestedPayouts() {
  return db
    .select({ payout: payouts, handle: users.handle })
    .from(payouts)
    .innerJoin(users, eq(users.id, payouts.creatorId))
    .where(eq(payouts.status, "requested"))
    .orderBy(payouts.requestedAt);
}

/** An operator sent the PromptPay transfer; record it and close the earnings it covered. */
export async function markPayoutPaid(payoutId: string, reference: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(payouts)
      .set({ status: "paid", reference: reference.trim().slice(0, 120) || null, paidAt: new Date() })
      .where(and(eq(payouts.id, payoutId), eq(payouts.status, "requested")))
      .returning({ id: payouts.id });
    if (!row) return;
    await tx.update(earnings).set({ status: "paid" }).where(eq(earnings.payoutId, payoutId));
  });
}

/** Turned down — wrong account, a question to answer — and the earnings go back to available. */
export async function rejectPayout(payoutId: string, note: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(payouts)
      .set({ status: "rejected", note: note.trim().slice(0, 300) })
      .where(and(eq(payouts.id, payoutId), eq(payouts.status, "requested")))
      .returning({ id: payouts.id });
    if (!row) return;
    await tx.update(earnings).set({ payoutId: null }).where(eq(earnings.payoutId, payoutId));
  });
}

/* ---------------------------- Refunds ---------------------------------- */

/**
 * A paid episode stopped existing for its buyers — a moderator removed it,
 * or its creator deleted it. Everyone whose purchase is still inside the
 * creator's earnings window (open, not yet claimed by a payout) gets their
 * credits back, and the creator's matching earnings are reversed. Purchases
 * whose earnings were already paid out are not clawed back from the creator.
 */
export async function refundVideoUnlocks(videoId: string): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ unlock: unlocks, earningId: earnings.id })
      .from(unlocks)
      .innerJoin(earnings, eq(earnings.unlockId, unlocks.id))
      .where(
        and(
          eq(unlocks.videoId, videoId),
          isNull(unlocks.refundedAt),
          eq(earnings.status, "open"),
          isNull(earnings.payoutId),
          gt(unlocks.price, 0),
        ),
      )
      .for("update");
    const now = new Date();
    for (const { unlock, earningId } of rows) {
      await returnCredits(tx, unlock.userId, { paid: unlock.paidSpent, bonus: unlock.bonusSpent }, now);
      // The unlock goes; the ledger line below is the record. Deleting rather
      // than marking it means the episode can be bought again if it is restored.
      await tx.delete(unlocks).where(eq(unlocks.id, unlock.id));
      await tx.update(earnings).set({ status: "reversed" }).where(eq(earnings.id, earningId));
      await tx.insert(creditLedger).values({
        id: newId("led"),
        userId: unlock.userId,
        delta: unlock.price,
        reason: "refund",
        unlockId: unlock.id,
        externalRef: `refund:${unlock.id}`,
        note: "episode no longer available",
      });
    }
    return rows.length;
  });
}
