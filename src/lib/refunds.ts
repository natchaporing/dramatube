import { and, eq, inArray } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { creditLedger, creditLots, creditSpends, earnings, purchases, unlocks, type Unlock } from "@/db/schema";
import { newId } from "./ids";
import { expireLots, restoreCredits } from "./wallet";

/**
 * Undoing sales, which happens two ways:
 *
 * - an episode stops existing for its buyers (a moderator removed it, its
 *   creator deleted it or made it private): every buyer gets their credits
 *   back, into the lots they came from;
 * - money goes back to a card (a refund or a dispute): the credits that top-up
 *   bought are taken back, and so is every episode bought with them.
 *
 * Either way the creator's sale is undone too. If no payout has claimed it
 * yet it is simply reversed; if one has, a clawback comes off the next.
 * Nobody keeps an episode that was not paid for, and no creator is paid for a
 * sale that was undone, however long after.
 */

/** The creator's side of an undone sale. */
async function takeBackEarning(tx: Tx, unlockId: string, now: Date) {
  const [earning] = await tx
    .select()
    .from(earnings)
    .where(and(eq(earnings.unlockId, unlockId), eq(earnings.kind, "sale")))
    .for("update")
    .limit(1);
  if (!earning || earning.status === "reversed") return;
  if (earning.status === "open" && earning.payoutId === null) {
    await tx.update(earnings).set({ status: "reversed" }).where(eq(earnings.id, earning.id));
    return;
  }
  await tx
    .insert(earnings)
    .values({
      id: newId("ern"),
      creatorId: earning.creatorId,
      unlockId,
      kind: "clawback",
      videoId: earning.videoId,
      credits: -earning.credits,
      attribution: earning.attribution,
      availableAt: now,
    })
    .onConflictDoNothing();
}

/**
 * Undo one unlock. The credits that paid for it go back, except those from
 * `except` — a top-up whose money has already gone back to the buyer.
 * Returns how many credits came back.
 */
async function undoUnlock(tx: Tx, unlock: Unlock, now: Date, opts: { except?: string; note: string; alwaysRecord: boolean }) {
  const parts = await tx.select().from(creditSpends).where(eq(creditSpends.unlockId, unlock.id));
  const restored = await restoreCredits(
    tx,
    parts.filter((part) => !opts.except || part.purchaseId !== opts.except),
    now,
  );
  // Deleted rather than marked, so the episode can be bought again if it comes back.
  await tx.delete(unlocks).where(eq(unlocks.id, unlock.id));
  await takeBackEarning(tx, unlock.id, now);
  if (restored > 0 || opts.alwaysRecord) {
    await tx.insert(creditLedger).values({
      id: newId("led"),
      userId: unlock.userId,
      delta: restored,
      reason: "refund",
      unlockId: unlock.id,
      externalRef: `refund:${unlock.id}`,
      note: opts.note,
    });
  }
  return restored;
}

/**
 * Everyone who bought this episode gets their credits back. Runs inside the
 * caller's transaction, which must already hold the video's row lock: an
 * unlock takes a share lock on the same row, so none can land between the
 * refunds and the episode going away.
 */
export async function refundVideoUnlocks(tx: Tx, videoId: string): Promise<number> {
  const rows = await tx.select().from(unlocks).where(eq(unlocks.videoId, videoId)).for("update");
  const now = new Date();
  for (const unlock of rows) await undoUnlock(tx, unlock, now, { note: "removed", alwaysRecord: true });
  return rows.length;
}

/**
 * Money that went back — a refund or a card dispute. Takes back what is left
 * of the credits it bought, and every episode bought with any of them. If it
 * arrives before the credits were granted, the purchase is marked so they
 * never are.
 */
export async function reversePurchase(purchaseId: string, why: "refund" | "dispute") {
  return db.transaction(async (tx) => {
    const [purchase] = await tx.select().from(purchases).where(eq(purchases.id, purchaseId)).for("update").limit(1);
    if (!purchase || purchase.status === "reversed") return { reversed: false, clawedBack: 0, undone: 0 };
    await tx.update(purchases).set({ status: "reversed" }).where(eq(purchases.id, purchase.id));
    if (purchase.status !== "paid" || !purchase.userId) return { reversed: true, clawedBack: 0, undone: 0 };

    const now = new Date();
    // Expired bonus is written off first, so the reversal line takes back only what was usable.
    await expireLots(tx, purchase.userId, now);
    const lots = await tx.select().from(creditLots).where(eq(creditLots.purchaseId, purchase.id)).for("update");
    let clawedBack = 0;
    for (const lot of lots) {
      clawedBack += lot.remaining;
      await tx.update(creditLots).set({ remaining: 0 }).where(eq(creditLots.id, lot.id));
    }
    await tx.insert(creditLedger).values({
      id: newId("led"),
      userId: purchase.userId,
      delta: -clawedBack,
      reason: "reversal",
      purchaseId: purchase.id,
      externalRef: `reversal:${purchase.id}`,
      note: why,
    });

    const funded = await tx
      .selectDistinct({ unlockId: creditSpends.unlockId })
      .from(creditSpends)
      .where(eq(creditSpends.purchaseId, purchase.id));
    const bought = funded.length
      ? await tx
          .select()
          .from(unlocks)
          .where(inArray(unlocks.id, funded.map((row) => row.unlockId)))
          .for("update")
      : [];
    for (const unlock of bought) await undoUnlock(tx, unlock, now, { except: purchase.id, note: "revoked", alwaysRecord: false });
    return { reversed: true, clawedBack, undone: bought.length };
  });
}
