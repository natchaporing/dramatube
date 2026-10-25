import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { creditLedger, creditLots, purchases, type Purchase } from "@/db/schema";
import { newId } from "./ids";
import { BONUS_EXPIRY_DAYS } from "./money";

/**
 * A viewer's credits.
 *
 * Held as lots so bonus credits can expire: spending takes bonus first,
 * soonest-expiring first, then bought credits oldest first. Every movement
 * also writes a ledger row, which is what explains a balance to the person
 * holding it and to whoever answers their support email.
 */

export class InsufficientCredits extends Error {
  constructor(
    public readonly needed: number,
    public readonly available: number,
  ) {
    super("INSUFFICIENT_CREDITS");
  }
}

const live = (now: Date) => or(isNull(creditLots.expiresAt), gt(creditLots.expiresAt, now));

export interface Balance {
  total: number;
  paid: number;
  bonus: number;
  /** The soonest a bonus credit expires, if any are held. */
  bonusExpiresAt: Date | null;
}

export async function balanceOf(userId: string, now = new Date()): Promise<Balance> {
  const [row] = await db
    .select({
      paid: sql<number>`coalesce(sum(${creditLots.remaining}) filter (where ${creditLots.source} = 'paid'), 0)::int`,
      bonus: sql<number>`coalesce(sum(${creditLots.remaining}) filter (where ${creditLots.source} = 'bonus'), 0)::int`,
      bonusExpiresAt: sql<Date | null>`min(${creditLots.expiresAt}) filter (where ${creditLots.source} = 'bonus' and ${creditLots.remaining} > 0)`,
    })
    .from(creditLots)
    .where(and(eq(creditLots.userId, userId), gt(creditLots.remaining, 0), live(now)));
  return {
    paid: row.paid,
    bonus: row.bonus,
    total: row.paid + row.bonus,
    bonusExpiresAt: row.bonusExpiresAt ? new Date(row.bonusExpiresAt) : null,
  };
}

/**
 * Take credits from a wallet inside the caller's transaction. Locks the lots
 * it reads, so two unlocks racing for the last thirty credits cannot both
 * spend them.
 */
export async function spendCredits(
  tx: Tx,
  userId: string,
  amount: number,
  now = new Date(),
): Promise<{ paidSpent: number; bonusSpent: number }> {
  const lots = await tx
    .select()
    .from(creditLots)
    .where(and(eq(creditLots.userId, userId), gt(creditLots.remaining, 0), live(now)))
    .orderBy(
      sql`case when ${creditLots.source} = 'bonus' then 0 else 1 end`,
      sql`${creditLots.expiresAt} asc nulls last`,
      asc(creditLots.createdAt),
    )
    .for("update");
  const available = lots.reduce((sum, lot) => sum + lot.remaining, 0);
  if (available < amount) throw new InsufficientCredits(amount, available);

  let left = amount;
  let paidSpent = 0;
  let bonusSpent = 0;
  for (const lot of lots) {
    if (left === 0) break;
    const take = Math.min(lot.remaining, left);
    await tx
      .update(creditLots)
      .set({ remaining: lot.remaining - take })
      .where(eq(creditLots.id, lot.id));
    if (lot.source === "bonus") bonusSpent += take;
    else paidSpent += take;
    left -= take;
  }
  return { paidSpent, bonusSpent };
}

/** Put credits back, as the kinds they were spent as. */
export async function returnCredits(
  tx: Tx,
  userId: string,
  credits: { paid: number; bonus: number },
  now = new Date(),
) {
  if (credits.paid > 0) {
    await tx.insert(creditLots).values({ id: newId("lot"), userId, source: "paid", amount: credits.paid, remaining: credits.paid });
  }
  if (credits.bonus > 0) {
    await tx.insert(creditLots).values({
      id: newId("lot"),
      userId,
      source: "bonus",
      amount: credits.bonus,
      remaining: credits.bonus,
      expiresAt: new Date(now.getTime() + BONUS_EXPIRY_DAYS * 86_400_000),
    });
  }
}

/**
 * Turn a paid purchase into credits, exactly once.
 *
 * Called by webhooks, by the page polling a PromptPay QR, and by the return
 * from Stripe — often several of them for one payment, sometimes at the same
 * moment. The purchase row is locked, and the ledger's unique `externalRef`
 * is the second guarantee: a grant that somehow ran twice fails on insert
 * and rolls back. The credits come from the row, written before the viewer
 * paid; nothing in a provider's message can change them.
 */
export async function grantPurchase(purchaseId: string, paidSatang: number): Promise<"granted" | "already" | "mismatch"> {
  return db.transaction(async (tx) => {
    const [purchase] = await tx.select().from(purchases).where(eq(purchases.id, purchaseId)).for("update").limit(1);
    if (!purchase) throw new Error(`no purchase ${purchaseId}`);
    if (purchase.status === "paid" || purchase.status === "reversed") return "already";
    if (paidSatang < purchase.amountSatang) return "mismatch";
    if (!purchase.userId) return "already";

    const now = new Date();
    await tx.update(purchases).set({ status: "paid", paidAt: now }).where(eq(purchases.id, purchase.id));
    await tx.insert(creditLots).values({
      id: newId("lot"),
      userId: purchase.userId,
      source: "paid",
      amount: purchase.credits,
      remaining: purchase.credits,
      purchaseId: purchase.id,
    });
    await tx.insert(creditLedger).values({
      id: newId("led"),
      userId: purchase.userId,
      delta: purchase.credits,
      reason: "topup",
      purchaseId: purchase.id,
      externalRef: `topup:${purchase.id}`,
    });
    if (purchase.bonusCredits > 0) {
      await tx.insert(creditLots).values({
        id: newId("lot"),
        userId: purchase.userId,
        source: "bonus",
        amount: purchase.bonusCredits,
        remaining: purchase.bonusCredits,
        expiresAt: new Date(now.getTime() + BONUS_EXPIRY_DAYS * 86_400_000),
        purchaseId: purchase.id,
      });
      await tx.insert(creditLedger).values({
        id: newId("led"),
        userId: purchase.userId,
        delta: purchase.bonusCredits,
        reason: "bonus",
        purchaseId: purchase.id,
        externalRef: `bonus:${purchase.id}`,
      });
    }
    return "granted";
  });
}

/**
 * Money that went back — a refund or a card dispute — takes back the credits
 * it bought, as far as they are still unspent. What was already spent stays
 * spent (the creator was paid in good faith) and is recorded on the ledger
 * so a moderator can see it.
 */
export async function reversePurchase(purchaseId: string, why: "refund" | "dispute") {
  return db.transaction(async (tx) => {
    const [purchase] = await tx.select().from(purchases).where(eq(purchases.id, purchaseId)).for("update").limit(1);
    if (!purchase || purchase.status !== "paid" || !purchase.userId) return { reversed: false, clawedBack: 0, shortfall: 0 };
    const lots = await tx.select().from(creditLots).where(eq(creditLots.purchaseId, purchase.id)).for("update");
    let clawedBack = 0;
    for (const lot of lots) {
      clawedBack += lot.remaining;
      await tx.update(creditLots).set({ remaining: 0 }).where(eq(creditLots.id, lot.id));
    }
    const shortfall = purchase.credits + purchase.bonusCredits - clawedBack;
    await tx.update(purchases).set({ status: "reversed" }).where(eq(purchases.id, purchase.id));
    await tx.insert(creditLedger).values({
      id: newId("led"),
      userId: purchase.userId,
      delta: -clawedBack,
      reason: "reversal",
      purchaseId: purchase.id,
      externalRef: `reversal:${purchase.id}`,
      note: `${why}${shortfall > 0 ? `; ${shortfall} credits already spent` : ""}`,
    });
    return { reversed: true, clawedBack, shortfall };
  });
}

/** Whether this account may still buy the once-only first top-up. */
export async function firstTopUpAvailable(userId: string, tx: Tx | typeof db = db): Promise<boolean> {
  const [row] = await tx
    .select({ id: purchases.id })
    .from(purchases)
    .where(and(eq(purchases.userId, userId), or(eq(purchases.status, "paid"), eq(purchases.status, "reversed"), and(eq(purchases.packId, "first"), eq(purchases.status, "pending")))))
    .limit(1);
  return !row;
}

export async function ledgerOf(userId: string, limit = 50) {
  return db.select().from(creditLedger).where(eq(creditLedger.userId, userId)).orderBy(desc(creditLedger.createdAt)).limit(limit);
}

export async function purchaseFor(userId: string, purchaseId: string): Promise<Purchase | null> {
  const [row] = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.id, purchaseId), eq(purchases.userId, userId)))
    .limit(1);
  return row ?? null;
}
