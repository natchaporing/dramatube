import { and, asc, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
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

/** One lot's contribution to a purchase of episodes. */
export interface SpentPart {
  lotId: string;
  purchaseId: string | null;
  source: "paid" | "bonus";
  amount: number;
}

/**
 * Take credits from a wallet inside the caller's transaction. Locks the lots
 * it reads, so two unlocks racing for the last thirty credits cannot both
 * spend them. Returns the lots drawn on, in the order they were spent.
 */
export async function spendCredits(tx: Tx, userId: string, amount: number, now = new Date()): Promise<SpentPart[]> {
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
  const parts: SpentPart[] = [];
  for (const lot of lots) {
    if (left === 0) break;
    const take = Math.min(lot.remaining, left);
    await tx
      .update(creditLots)
      .set({ remaining: lot.remaining - take })
      .where(eq(creditLots.id, lot.id));
    parts.push({ lotId: lot.id, purchaseId: lot.purchaseId, source: lot.source, amount: take });
    left -= take;
  }
  return parts;
}

/**
 * Put spent credits back into the lots they came from, so bonus credits keep
 * their original expiry. A lot that has expired since, or whose top-up was
 * reversed, takes nothing back. Returns how many credits came back.
 */
export async function restoreCredits(tx: Tx, parts: { lotId: string; amount: number }[], now = new Date()): Promise<number> {
  let restored = 0;
  for (const part of parts) {
    const [row] = await tx
      .update(creditLots)
      .set({ remaining: sql`${creditLots.remaining} + ${part.amount}` })
      .where(
        and(
          eq(creditLots.id, part.lotId),
          live(now),
          // Spelled out: inside an UPDATE drizzle leaves columns unqualified.
          sql`not exists (select 1 from "purchases" p where p.id = "credit_lots"."purchase_id" and p.status = 'reversed')`,
        ),
      )
      .returning({ id: creditLots.id });
    if (row) restored += part.amount;
  }
  return restored;
}

/**
 * Write off bonus credits that have passed their date, once each, so the
 * ledger keeps adding up to the balance.
 */
export async function expireLots(tx: Tx, userId: string, now = new Date()) {
  const lots = await tx
    .select()
    .from(creditLots)
    .where(and(eq(creditLots.userId, userId), gt(creditLots.remaining, 0), lte(creditLots.expiresAt, now)))
    .for("update");
  for (const lot of lots) {
    await tx.update(creditLots).set({ remaining: 0 }).where(eq(creditLots.id, lot.id));
    await tx.insert(creditLedger).values({
      id: newId("led"),
      userId,
      delta: -lot.remaining,
      reason: "expiry",
      purchaseId: lot.purchaseId,
      externalRef: `expiry:${lot.id}`,
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
  await db.transaction((tx) => expireLots(tx, userId));
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
