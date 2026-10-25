import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { creditLedger, earnings, referrals, unlocks, videos } from "@/db/schema";
import { isPaidEpisode, saleOf, type Sale } from "./access";
import { newId } from "./ids";
import { HOLD_DAYS, REFERRAL_DAYS, creatorCredits, isExclusive, seriesPrice, type Attribution } from "./money";
import { isDirect, type RefMap } from "./referral";
import { InsufficientCredits, spendCredits } from "./wallet";

/**
 * Buying an episode, or the rest of a series.
 *
 * One transaction does everything a sale touches: the viewer's credits, the
 * unlock, the ledger line and the creator's earnings. Either all of it
 * happens or none of it does, so a creator is never paid for an episode
 * nobody bought and a viewer is never charged for one they cannot watch.
 */

export class UnlockError extends Error {
  constructor(public readonly code: "not_found" | "not_locked" | "nothing_left") {
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

/** Write the unlocks, ledger line and earnings for lines already paid for. */
async function record(
  tx: Tx,
  opts: { userId: string; sale: Sale; attribution: Attribution; lines: Line[]; paidSpent: number; bonusSpent: number; viaSeriesPrice: boolean },
) {
  const now = new Date();
  const availableAt = new Date(now.getTime() + HOLD_DAYS * 86_400_000);
  const exclusive = isExclusive(opts.sale.exclusiveSince, now);
  // Bonus credits are attributed to the first episodes, bought credits to the rest.
  let bonusLeft = opts.bonusSpent;
  const ids: string[] = [];
  for (const line of opts.lines) {
    const bonus = Math.min(bonusLeft, line.price);
    bonusLeft -= bonus;
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
    note: opts.lines.length > 1 ? `${opts.lines.length} episodes` : "",
  });
  return ids;
}

function alreadyOwned(error: unknown) {
  return (error as { code?: string }).code === "23505";
}

/** Unlock one episode. Returns false if the viewer already owned it (and charges nothing). */
export async function unlockEpisode(userId: string, videoId: string, refs: RefMap): Promise<boolean> {
  const [video] = await db
    .select({ id: videos.id, seriesId: videos.seriesId, episodeNumber: videos.episodeNumber, channelId: videos.channelId, status: videos.status, visibility: videos.visibility })
    .from(videos)
    .where(eq(videos.id, videoId))
    .limit(1);
  if (!video || video.status !== "ready" || video.visibility === "private" || !video.seriesId) throw new UnlockError("not_found");
  const sale = await saleOf(video.seriesId);
  if (!isPaidEpisode(sale, video.episodeNumber) || video.channelId === userId) throw new UnlockError("not_locked");

  try {
    await db.transaction(async (tx) => {
      const [owned] = await tx
        .select({ id: unlocks.id })
        .from(unlocks)
        .where(and(eq(unlocks.userId, userId), eq(unlocks.videoId, video.id)))
        .limit(1);
      if (owned) throw Object.assign(new Error("owned"), { code: "23505" });
      const attribution = await attributionFor(tx, userId, sale!.channelId, refs);
      const spent = await spendCredits(tx, userId, sale!.episodePrice);
      await record(tx, {
        userId,
        sale: sale!,
        attribution,
        lines: [{ videoId: video.id, price: sale!.episodePrice }],
        ...spent,
        viaSeriesPrice: false,
      });
    });
    return true;
  } catch (error) {
    if (alreadyOwned(error)) return false;
    throw error;
  }
}

/**
 * The episodes of a series this viewer would still have to pay for, in
 * order, with what the rest would cost at the series price. Only episodes
 * that are out and public; later episodes are sold as they come.
 */
export async function restOfSeries(userId: string | null, seriesId: string) {
  const sale = await saleOf(seriesId);
  if (!sale || !sale.onSale || !sale.sellerApproved || sale.channelId === userId) return null;
  const episodes = await db
    .select({ id: videos.id, episodeNumber: videos.episodeNumber })
    .from(videos)
    .where(
      and(
        eq(videos.seriesId, seriesId),
        eq(videos.status, "ready"),
        eq(videos.visibility, "public"),
        gt(videos.episodeNumber, sale.freeEpisodes),
      ),
    )
    .orderBy(sql`${videos.episodeNumber} asc`);
  const owned = userId && episodes.length
    ? new Set(
        (
          await db
            .select({ videoId: unlocks.videoId })
            .from(unlocks)
            .where(and(eq(unlocks.userId, userId), isNull(unlocks.refundedAt), inArray(unlocks.videoId, episodes.map((episode) => episode.id))))
        ).map((row) => row.videoId),
      )
    : new Set<string>();
  const remaining = episodes.filter((episode) => !owned.has(episode.id));
  const { total, each } = seriesPrice(remaining.map(() => sale.episodePrice), sale.seriesPricePercent);
  return { sale, remaining, total, each, fullPrice: remaining.length * sale.episodePrice };
}

/** Unlock every remaining episode at the series price. Returns how many were unlocked. */
export async function unlockRest(userId: string, seriesId: string, refs: RefMap): Promise<number> {
  const plan = await restOfSeries(userId, seriesId);
  if (!plan) throw new UnlockError("not_locked");
  if (plan.remaining.length === 0) throw new UnlockError("nothing_left");
  // A single remaining episode is just an episode; the series price is for buying in bulk.
  try {
    await db.transaction(async (tx) => {
      const attribution = await attributionFor(tx, userId, plan.sale.channelId, refs);
      const spent = await spendCredits(tx, userId, plan.total);
      await record(tx, {
        userId,
        sale: plan.sale,
        attribution,
        lines: plan.remaining.map((episode, index) => ({ videoId: episode.id, price: plan.each[index] })),
        ...spent,
        viaSeriesPrice: true,
      });
    });
  } catch (error) {
    // Another tab unlocked one of these a moment ago; nothing was charged.
    if (alreadyOwned(error)) throw new UnlockError("nothing_left");
    throw error;
  }
  return plan.remaining.length;
}
