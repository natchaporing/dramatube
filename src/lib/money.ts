/**
 * The money rules, as data and pure functions. Every number here is in
 * docs/MONETIZATION.md; this file is where the code agrees with it.
 *
 * Units: credits are integers. Baht amounts are integers in satang
 * (฿1 = 100 satang), so nothing is ever rounded by floating point.
 */

export interface Pack {
  id: string;
  priceSatang: number;
  credits: number;
  bonus: number;
  /** Once per account: the first top-up offer. */
  firstOnly?: boolean;
}

/** Base rate ฿1 = 3 credits; the bonus grows with the pack. */
export const PACKS: Pack[] = [
  { id: "first", priceSatang: 1_900, credits: 90, bonus: 0, firstOnly: true },
  { id: "taster", priceSatang: 4_900, credits: 150, bonus: 0 },
  { id: "regular", priceSatang: 9_900, credits: 300, bonus: 15 },
  { id: "binge", priceSatang: 19_900, credits: 600, bonus: 60 },
  { id: "superfan", priceSatang: 49_900, credits: 1_500, bonus: 225 },
  { id: "whale", priceSatang: 99_900, credits: 3_000, bonus: 600 },
];

export function packById(id: string): Pack | null {
  return PACKS.find((pack) => pack.id === id) ?? null;
}

export const BONUS_EXPIRY_DAYS = 90;
export const HOLD_DAYS = 14;
export const REFERRAL_DAYS = 30;
export const EXCLUSIVE_DAYS = 90;

/** Creator shares, in percent. */
export const SHARE = { direct: 70, discovered: 40 } as const;
export const EXCLUSIVE_BONUS = 10;
export type Attribution = keyof typeof SHARE;

/** What one earned credit pays out in cash: ฿0.30. */
export const PAYOUT_SATANG_PER_CREDIT = 30;
export const MIN_PAYOUT_SATANG = 50_000;
export const MIN_PAYOUT_CREDITS = Math.ceil(MIN_PAYOUT_SATANG / PAYOUT_SATANG_PER_CREDIT);

/** What a creator may charge. */
export const EPISODE_PRICES = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60] as const;
export const DEFAULT_EPISODE_PRICE = 30;
export const SERIES_PERCENT_MIN = 50;
export const SERIES_PERCENT_MAX = 100;
export const FREE_EPISODES_MIN = 1;
export const FREE_EPISODES_MAX = 50;

export function isEpisodePrice(value: number): boolean {
  return (EPISODE_PRICES as readonly number[]).includes(value);
}

export function sharePercent(attribution: Attribution, exclusive: boolean): number {
  return SHARE[attribution] + (exclusive ? EXCLUSIVE_BONUS : 0);
}

/**
 * The creator's credits from one unlock, rounded down. Rounding to nearest
 * would pay 6 credits on a 7-credit episode at 80% — more than the share —
 * and a creator buying their own cheap episodes could turn that into cash.
 */
export function creatorCredits(price: number, attribution: Attribution, exclusive: boolean): number {
  return Math.floor((price * sharePercent(attribution, exclusive)) / 100);
}

/** Whether a series is inside its 90-day exclusive window. */
export function isExclusive(exclusiveSince: Date | null, now = new Date()): boolean {
  if (!exclusiveSince) return false;
  return now.getTime() - exclusiveSince.getTime() < EXCLUSIVE_DAYS * 86_400_000;
}

/**
 * The rest of a series at once. Returns the total and how it divides over the
 * episodes, so each episode's unlock records what it actually cost and the
 * creator's share and any refund are exact. Remainders go to the earliest
 * episodes, one credit each.
 */
export function seriesPrice(episodePrices: number[], percent: number): { total: number; each: number[] } {
  const full = episodePrices.reduce((sum, price) => sum + price, 0);
  const total = Math.round((full * percent) / 100);
  if (episodePrices.length === 0) return { total: 0, each: [] };
  // Proportional to each episode's own price, floored, then the leftover
  // credits handed out one at a time from the first episode.
  const each = episodePrices.map((price) => Math.floor((price * total) / full));
  let leftover = total - each.reduce((sum, credits) => sum + credits, 0);
  for (let i = 0; leftover > 0; i = (i + 1) % each.length, leftover--) each[i] += 1;
  return { total, each };
}

export function satangToBaht(satang: number): string {
  const baht = satang / 100;
  return Number.isInteger(baht) ? `฿${baht.toLocaleString("en-US")}` : `฿${baht.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function creditsToSatang(credits: number): number {
  return credits * PAYOUT_SATANG_PER_CREDIT;
}

/**
 * Seller checks. A PromptPay ID is a 10-digit Thai mobile number starting
 * with 0, or a 13-digit citizen ID whose last digit is its check digit.
 */
export function normalizePromptPay(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  if (/^0\d{9}$/.test(digits)) return digits;
  if (/^\d{13}$/.test(digits) && citizenIdValid(digits)) return digits;
  return null;
}

export function citizenIdValid(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

/** Thai age of majority is 20. */
export function ageOn(birthDate: string, now = new Date()): number {
  const [year, month, day] = birthDate.split("-").map(Number);
  let age = now.getUTCFullYear() - year;
  const beforeBirthday = now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

export const SELLER_MIN_AGE = 20;
