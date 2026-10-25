import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { uniqueViolation } from "@/db/errors";
import { creditLedger, creditSpends, earnings, referrals, unlocks, videos } from "@/db/schema";
import { isPaidEpisode, lockSale, saleOf, type Sale } from "./access";
import { newId } from "./ids";
import { HOLD_DAYS, REFERRAL_DAYS, creatorCredits, isExclusive, seriesPrice, type Attribution } from "./money";
import { isDirect, type RefMap } from "./referral";
import { InsufficientCredits, spendCredits, type SpentPart } from "./wallet";

/**
 * Buying an episode, or the rest of a series.
 *
 * One transaction does everything a sale touches: the viewer's credits, the
 * unlock, which credits paid for it, the ledger line and the creator's
 * earnings. Either all of it happens or none of it does, so a creator is
 * never paid for an episode nobody bought and a viewer is never charged for
 * one they cannot watch.
 *
 * The buyer says what they expect to pay — the price on the button they
 * pressed — and the sale goes through only at that price. The series row is
 * share-locked while it happens, so a price change waits for it.
 */

export class UnlockError extends Error {
  constructor(public readonly code: "not_found" | "not_locked" | "nothing_left" | "price_changed") {
    super(code);
  }
}
export { InsufficientCredits };

async function attributionFor(tx: Tx, userId: string, channelId: string, refs: RefMap): Promise<Attribution> {
  if (isDirect(refs, channelId)) return "direct";
  const [row] = await tx
    .select({ at: referrals.at })
    .from(referrals)
    .where(
      and(
        eq(referrals.userId, userId),
        eq(referrals.channelId, channelId),
        gt(referrals.at, new Date(Date.now() - REFERRAL_DAYS * 86_400_000)),
      ),
    )
    .limit(1);
  return row ? "direct" : "discovered";
}

interface Line {
  videoId: string;
  price: number;
}

/** Write the unlocks, what paid for each, the ledger line and the earnings. */
async function record(
  tx: Tx,
  opts: { userId: string; sale: Sale; attribution: Attribution; lines: Line[]; parts: SpentPart[]; viaSeriesPrice: boolean },
) {
  const now = new Date();
  const availableAt = new Date(now.getTime() + HOLD_DAYS * 86_400_000);
  const exclusive = isExclusive(opts.sale.exclusiveSince, now);
  // The lots were spent bonus first, so bonus credits pay for the first episodes.
  const queue = opts.parts.map((part) => ({ ...part }));
  const ids: string[] = [];
  for (const line of opts.lines) {
    const pieces: SpentPart[] = [];
    for (let need = line.price; need > 0; ) {
      const head = queue[0];
      const take = Math.min(head.amount, need);
      pieces.push({ ...head, amount: take });
      head.amount -= take;
      need -= take;
      if (head.amount === 0) queue.shift();
    }
    const bonus = pieces.filter((piece) => piece.source === "bonus").reduce((sum, piece) => sum + piece.amount, 0);
    const id = newId("unl");
    ids.push(id);
    await tx.insert(unlocks).values({
      id,
      userId: opts.userId,
      videoId: line.videoId,
      creatorId: opts.sale.channelId,
      price: line.price,
      paidSpent: line.price - bonus,
      bonusSpent: bonus,
      attribution: opts.attribution,
      viaSeriesPrice: opts.viaSeriesPrice,
    });
    await tx.insert(creditSpends).values(
      pieces.map((piece) => ({ id: newId("spd"), unlockId: id, lotId: piece.lotId, purchaseId: piece.purchaseId, amount: piece.amount })),
    );
    await tx.insert(earnings).values({
      id: newId("ern"),
      creatorId: opts.sale.channelId,
      unlockId: id,
      videoId: line.videoId,
      credits: creatorCredits(line.price, opts.attribution, exclusive),
      attribution: opts.attribution,
      availableAt,
    });
  }
  const total = opts.lines.reduce((sum, line) => sum + line.price, 0);
  await tx.insert(creditLedger).values({
    id: newId("led"),
    userId: opts.userId,
    delta: -total,
    reason: "unlock",
    unlockId: ids[0],
    note: opts.lines.length > 1 ? `episodes:${opts.lines.length}` : "",
  });
  return ids;
}

/** Another tab bought the same episode a moment ago; the unique index stopped the second sale. */
function alreadyOwned(error: unknown) {
  return uniqueViolation(error) === "unlocks_user_video_idx";
}

/**
 * Unlock one episode at `expectedPrice`. Returns false if the viewer already
 * owned it (and charges nothing).
 */
export async function unlockEpisode(userId: string, videoId: string, refs: RefMap, expectedPrice: number): Promise<boolean> {
  try {
    return await db.transaction(async (tx) => {
      // Share-locked: a removal or delete takes this row's lock and refunds
      // every buyer, so it must not miss one that is committing now.
      const [video] = await tx
        .select({ id: videos.id, seriesId: videos.seriesId, episodeNumber: videos.episodeNumber, channelId: videos.channelId, status: videos.status, visibility: videos.visibility })
        .from(videos)
        .where(eq(videos.id, videoId))
        .for("share")
        .limit(1);
      if (!video || video.status !== "ready" || video.visibility === "private" || !video.seriesId) throw new UnlockError("not_found");
      const sale = await lockSale(tx, video.seriesId);
      if (!sale || !isPaidEpisode(sale, video.episodeNumber) || video.channelId === userId) throw new UnlockError("not_locked");
      if (sale.episodePrice !== expectedPrice) throw new UnlockError("price_changed");

      const [owned] = await tx
        .select({ id: unlocks.id })
        .from(unlocks)
        .where(and(eq(unlocks.userId, userId), eq(unlocks.videoId, video.id)))
        .limit(1);
      if (owned) return false;
      const attribution = await attributionFor(tx, userId, sale.channelId, refs);
      const parts = await spendCredits(tx, userId, sale.episodePrice);
      await record(tx, { userId, sale, attribution, lines: [{ videoId: video.id, price: sale.episodePrice }], parts, viaSeriesPrice: false });
      return true;
    });
  } catch (error) {
    if (alreadyOwned(error)) return false;
    throw error;
  }
}

/**
 * The episodes of a series this viewer would still have to pay for, in
 * order, with what they would cost together. Only episodes that are out and
 * public; later episodes are sold as they come. The series price is for
 * buying in bulk: a single remaining episode costs what an episode costs.
 */
async function planRest(q: Tx | typeof db, userId: string | null, sale: Sale, lock: boolean) {
  const query = q
    .select({ id: videos.id, episodeNumber: videos.episodeNumber })
    .from(videos)
    .where(
      and(
        eq(videos.seriesId, sale.seriesId),
        eq(videos.status, "ready"),
        eq(videos.visibility, "public"),
        gt(videos.episodeNumber, sale.freeEpisodes),
      ),
    )
    .orderBy(sql`${videos.episodeNumber} asc`);
  const episodes = lock ? await query.for("share") : await query;
  const owned =
    userId && episodes.length
      ? new Set(
          (
            await q
              .select({ videoId: unlocks.videoId })
              .from(unlocks)
              .where(and(eq(unlocks.userId, userId), isNull(unlocks.refundedAt), inArray(unlocks.videoId, episodes.map((episode) => episode.id))))
          ).map((row) => row.videoId),
        )
      : new Set<string>();
  const remaining = episodes.filter((episode) => !owned.has(episode.id));
  const prices = remaining.map(() => sale.episodePrice);
  const bulk = remaining.length > 1;
  const { total, each } = bulk ? seriesPrice(prices, sale.seriesPricePercent) : { total: prices[0] ?? 0, each: prices };
  return { sale, remaining, total, each, bulk, fullPrice: remaining.length * sale.episodePrice };
}

/** For the paywall: what "unlock the rest" would buy and cost. Null when the series is not for sale to this viewer. */
export async function restOfSeries(userId: string | null, seriesId: string) {
  const sale = await saleOf(seriesId);
  if (!sale || !sale.onSale || !sale.sellerApproved || sale.channelId === userId) return null;
  return planRest(db, userId, sale, false);
}

/**
 * Unlock every remaining episode, provided they are the ones the viewer was
 * shown (`expected.ids`) at the total they were shown. Returns how many were
 * unlocked.
 */
export async function unlockRest(userId: string, seriesId: string, refs: RefMap, expected: { ids: string[]; total: number }): Promise<number> {
  try {
    return await db.transaction(async (tx) => {
      const sale = await lockSale(tx, seriesId);
      if (!sale || !sale.onSale || !sale.sellerApproved || sale.channelId === userId) throw new UnlockError("not_locked");
      const plan = await planRest(tx, userId, sale, true);
      if (plan.remaining.length === 0) throw new UnlockError("nothing_left");
      const sameEpisodes =
        plan.remaining.length === expected.ids.length && plan.remaining.every((episode) => expected.ids.includes(episode.id));
      if (!sameEpisodes || plan.total !== expected.total) throw new UnlockError("price_changed");

      const attribution = await attributionFor(tx, userId, sale.channelId, refs);
      const parts = await spendCredits(tx, userId, plan.total);
      await record(tx, {
        userId,
        sale,
        attribution,
        lines: plan.remaining.map((episode, index) => ({ videoId: episode.id, price: plan.each[index] })),
        parts,
        viaSeriesPrice: plan.bulk,
      });
      return plan.remaining.length;
    });
  } catch (error) {
    // Another tab unlocked one of these a moment ago; nothing was charged.
    if (alreadyOwned(error)) throw new UnlockError("price_changed");
    throw error;
  }
}
