/**
 * The money rules, checked against a real database: what a sale writes, and
 * what undoing one undoes. Each run makes its own accounts and series, so it
 * can run against a dev database that already has data in it.
 *
 *   DATABASE_URL=… pnpm money-check
 *
 * The browser-level flow (paywall, top-up page, earnings page) is in
 * scripts/e2e-check.ts; this is the part a browser cannot see — races,
 * refunds after payout, card reversals, the ledger adding up.
 */
import "./load-env";
import { and, eq, inArray } from "drizzle-orm";
import { db, sql as client } from "../src/db";
import { creditLedger, creditLots, earnings, payouts, purchases, sellers, series, unlocks, users, videos } from "../src/db/schema";
import { locksFor } from "../src/lib/access";
import { applyToSell, requestPayout } from "../src/lib/earnings";
import { newId } from "../src/lib/ids";
import { removeVideo } from "../src/lib/moderation";
import { PaymentError, startPurchase } from "../src/lib/payments";
import { reversePurchase } from "../src/lib/refunds";
import { StudioError, updateSeriesPricing } from "../src/lib/studio";
import { restOfSeries, unlockEpisode, unlockRest } from "../src/lib/unlock";
import { balanceOf, grantPurchase, ledgerOf } from "../src/lib/wallet";

process.env.ALLOW_DEV_PAYMENTS = "1";
const run = Date.now().toString(36);
let failures = 0;

function check(ok: unknown, label: string) {
  if (ok) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}`);
  }
}

async function rejects(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    return false;
  } catch (error) {
    return (error as { code?: string; message?: string }).code === code || (error as Error).message === code;
  }
}

const made: string[] = [];

async function user(name: string, role: "member" | "admin" = "member") {
  const id = newId("user");
  made.push(id);
  await db.insert(users).values({ id, email: `${name}-${run}@money.example`, name, handle: `${name}${run}`.slice(0, 30), passwordHash: "x", role });
  return id;
}

async function episode(channelId: string, seriesId: string, number: number, publishedAt = new Date()) {
  const id = newId("video");
  await db.insert(videos).values({
    id,
    channelId,
    title: `Money check ${run} · ${number}`,
    videoKey: `videos/${id}/none.mp4`,
    mimeType: "video/mp4",
    byteSize: 1,
    seriesId,
    episodeNumber: number,
    publishedAt,
  });
  return id;
}

/** A paid top-up, the way a provider confirmation grants one. */
async function topUp(userId: string, credits: number, bonus = 0) {
  const id = newId("pur");
  await db.insert(purchases).values({
    id,
    userId,
    packId: "regular",
    credits,
    bonusCredits: bonus,
    amountSatang: 100,
    method: "promptpay",
    provider: "dev",
    providerRef: `check_${id}`,
  });
  await grantPurchase(id, 100);
  return id;
}

/** The ledger is the explanation of the balance: they must agree. */
async function ledgerAddsUp(userId: string) {
  const rows = await ledgerOf(userId, 1000);
  const sum = rows.reduce((total, row) => total + row.delta, 0);
  return sum === (await balanceOf(userId)).total;
}

async function earningsOf(creatorId: string) {
  return db.select().from(earnings).where(eq(earnings.creatorId, creatorId));
}

async function main() {
  try {
    const creator = await user("mcreator");
    const buyer = await user("mbuyer");
    const admin = await user("madmin", "admin");
    await db.insert(sellers).values({ userId: creator, status: "approved", legalName: "Money Check", promptpayId: "0812345678", birthDate: "1990-01-01" });
    const seriesId = newId("ser");
    await db.insert(series).values({ id: seriesId, channelId: creator, title: `Money ${run}`, onSale: true, freeEpisodes: 1, episodePrice: 30, seriesPricePercent: 70 });
    const [ep1, ep2, ep3, ep4] = [await episode(creator, seriesId, 1), await episode(creator, seriesId, 2), await episode(creator, seriesId, 3), await episode(creator, seriesId, 4)];
    void ep1;

    console.log("buying");
    await topUp(buyer, 300, 15);
    check(await rejects(unlockEpisode(buyer, ep2, {}, 25), "price_changed"), "a sale at a price the buyer was not shown is refused");
    check((await balanceOf(buyer)).total === 315, "…and charges nothing");

    const races = await Promise.allSettled(Array.from({ length: 5 }, () => unlockEpisode(buyer, ep2, {}, 30)));
    check(races.every((result) => result.status === "fulfilled"), "five unlocks of one episode at once: no errors");
    check(races.filter((result) => result.status === "fulfilled" && result.value === true).length === 1, "…exactly one sale");
    check((await balanceOf(buyer)).total === 285, "…charged once, bonus first");
    const [unl2] = await db.select().from(unlocks).where(and(eq(unlocks.userId, buyer), eq(unlocks.videoId, ep2)));
    check(unl2.bonusSpent === 15 && unl2.paidSpent === 15, "the unlock records which credits paid for it");

    const admins = await locksFor({ id: admin, role: "admin" }, [{ id: ep3, seriesId, episodeNumber: 3, channelId: creator }]);
    check(admins.size === 0, "a moderator is never locked out");

    console.log("the rest at once");
    const rest = await restOfSeries(buyer, seriesId);
    check(rest?.remaining.length === 2 && rest.total === 42, "two remaining episodes cost 42 at 70%");
    await episode(creator, seriesId, 5);
    check(
      await rejects(unlockRest(buyer, seriesId, {}, { ids: rest!.remaining.map((e) => e.id), total: rest!.total }), "price_changed"),
      "an episode published since the offer was shown: refused, not charged for silently",
    );
    const fresh = await restOfSeries(buyer, seriesId);
    check(fresh?.remaining.length === 3 && fresh.total === 63, "…and the new offer is three for 63");
    await unlockEpisode(buyer, ep3, {}, 30);
    await unlockEpisode(buyer, ep4, {}, 30);
    const single = await restOfSeries(buyer, seriesId);
    check(single?.remaining.length === 1 && single.total === 30 && !single.bulk, "one remaining episode costs a full episode, not the bundle price");
    const before = (await balanceOf(buyer)).total;
    await unlockRest(buyer, seriesId, {}, { ids: single!.remaining.map((e) => e.id), total: single!.total });
    check((await balanceOf(buyer)).total === before - 30, "…and is charged as one");

    console.log("refunds");
    const lotsBefore = await db.select().from(creditLots).where(eq(creditLots.userId, buyer));
    const balanceBefore = (await balanceOf(buyer)).total;
    await removeVideo(ep2, "check");
    check((await balanceOf(buyer)).total === balanceBefore + 30, "a removed episode refunds its buyer");
    const lotsAfter = await db.select().from(creditLots).where(eq(creditLots.userId, buyer));
    check(lotsAfter.length === lotsBefore.length, "…into the lots the credits came from, not new ones");
    const bonusLot = lotsAfter.find((lot) => lot.source === "bonus")!;
    check(bonusLot.remaining === 15 && bonusLot.expiresAt?.getTime() === lotsBefore.find((lot) => lot.source === "bonus")!.expiresAt?.getTime(), "…so bonus credits keep their original expiry");
    const ern2 = (await earningsOf(creator)).find((row) => row.unlockId === unl2.id)!;
    check(ern2.status === "reversed", "…and reverses the creator's earning");
    check(await ledgerAddsUp(buyer), "the buyer's ledger adds up to the balance");

    console.log("refunds after payout");
    // Pretend the hold has passed and the creator cashed out everything so far.
    await db.update(earnings).set({ availableAt: new Date(Date.now() - 86_400_000), credits: 2_000 }).where(eq(earnings.creatorId, creator));
    const payoutId = await requestPayout(creator);
    const claimed = (await earningsOf(creator)).filter((row) => row.payoutId === payoutId);
    check(claimed.length > 0, "a payout claims the available earnings");
    await removeVideo(ep3, "check");
    const clawback = (await earningsOf(creator)).find((row) => row.kind === "clawback");
    check(clawback && clawback.credits === -2_000 && clawback.payoutId === null, "an episode removed after payout still refunds its buyer, and the creator's next payout pays it back");
    check(await ledgerAddsUp(buyer), "the buyer's ledger still adds up");
    await db.update(payouts).set({ status: "rejected" }).where(eq(payouts.id, payoutId));

    console.log("card reversals");
    const fan = await user("mfan");
    const p1 = await topUp(fan, 60);
    await unlockEpisode(fan, ep4, {}, 30);
    const [unl4] = await db.select().from(unlocks).where(and(eq(unlocks.userId, fan), eq(unlocks.videoId, ep4)));
    const reversal = await reversePurchase(p1, "dispute");
    check(reversal.reversed && reversal.clawedBack === 30 && reversal.undone === 1, "a disputed top-up takes back its unspent credits and what it bought");
    check((await db.select().from(unlocks).where(eq(unlocks.id, unl4.id))).length === 0, "…the episode is no longer the buyer's");
    check((await earningsOf(creator)).find((row) => row.unlockId === unl4.id && row.kind === "sale")?.status === "reversed", "…and the creator is not paid for it");
    check((await balanceOf(fan)).total === 0 && (await ledgerAddsUp(fan)), "…and the ledger says so");

    const pending = newId("pur");
    await db.insert(purchases).values({ id: pending, userId: fan, packId: "taster", credits: 150, bonusCredits: 0, amountSatang: 4_900, method: "card", provider: "dev", providerRef: `check_${pending}` });
    await reversePurchase(pending, "refund");
    check((await grantPurchase(pending, 4_900)) === "already" && (await balanceOf(fan)).total === 0, "a refund that arrives before the payment is confirmed stops the grant");

    console.log("expiry");
    const lapsed = newId("lot");
    await db.insert(creditLots).values({ id: lapsed, userId: fan, source: "bonus", amount: 10, remaining: 10, expiresAt: new Date(Date.now() - 1000) });
    await db.insert(creditLedger).values({ id: newId("led"), userId: fan, delta: 10, reason: "bonus", externalRef: `bonus-check:${lapsed}` });
    check(await ledgerAddsUp(fan), "expired bonus credits are written off on the ledger");

    console.log("first top-up");
    const newcomer = await user("mnew");
    const starts = await Promise.allSettled(
      Array.from({ length: 4 }, () => startPurchase({ userId: newcomer, email: "x@money.example", packId: "first", method: "promptpay", origin: "http://x", returnTo: null })),
    );
    check(starts.every((result) => result.status === "fulfilled" || result.reason instanceof PaymentError), "four first top-ups at once: no errors");
    const firsts = await db.select().from(purchases).where(and(eq(purchases.userId, newcomer), eq(purchases.packId, "first")));
    check(firsts.length === 1, `…one purchase (got ${firsts.length})`);

    console.log("sellers and series");
    check(await rejects(applyToSell(creator, { legalName: "Money Check", promptpayId: "0899999999", birthDate: "1990-01-01" }), "approved"), "an approved seller cannot put themselves back to pending");
    check((await db.select().from(sellers).where(eq(sellers.userId, creator)))[0].status === "approved", "…and stays approved");
    const old = newId("ser");
    await db.insert(series).values({ id: old, channelId: creator, title: `Old ${run}` });
    await episode(creator, old, 1, new Date(Date.now() - 120 * 86_400_000));
    const input = { onSale: true, freeEpisodes: 1, episodePrice: 30, seriesPricePercent: 70, exclusive: true };
    let closed = false;
    try {
      await updateSeriesPricing(creator, old, input);
    } catch (error) {
      closed = error instanceof StudioError && error.message === "exclusive_closed";
    }
    check(closed, "a series past its first 90 days cannot become exclusive");
    await updateSeriesPricing(creator, seriesId, input);
    const [exclusive] = await db.select({ since: series.exclusiveSince }).from(series).where(eq(series.id, seriesId));
    check(exclusive.since !== null, "a new series can");
    await db.update(series).set({ exclusiveSince: new Date(Date.now() - 100 * 86_400_000) }).where(eq(series.id, seriesId));
    await updateSeriesPricing(creator, seriesId, input);
    const [again] = await db.select({ since: series.exclusiveSince }).from(series).where(eq(series.id, seriesId));
    check(again.since!.getTime() < Date.now() - 99 * 86_400_000, "…once: the window does not start again");

  } finally {
    // Its accounts, and with them its series and episodes, so they never sit on a dev site's shelves.
    if (made.length) await db.delete(users).where(inArray(users.id, made));
    await client.end();
  }
  if (failures > 0) {
    console.log(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall money checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
