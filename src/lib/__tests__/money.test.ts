import { describe, expect, it } from "vitest";
import {
  MIN_PAYOUT_CREDITS,
  PACKS,
  ageOn,
  citizenIdValid,
  creatorCredits,
  isExclusive,
  normalizePromptPay,
  satangToBaht,
  seriesPrice,
} from "../money";
import { isDirect, readRefCookie, withReferral, writeRefCookie } from "../referral";

describe("creator share", () => {
  it("pays 70% on the creator's own links and 40% on DramaTube's", () => {
    expect(creatorCredits(30, "direct", false)).toBe(21);
    expect(creatorCredits(30, "discovered", false)).toBe(12);
  });
  it("adds ten points for an exclusive series", () => {
    expect(creatorCredits(30, "direct", true)).toBe(24);
    expect(creatorCredits(30, "discovered", true)).toBe(15);
  });
  it("rounds half a credit up", () => {
    expect(creatorCredits(25, "direct", false)).toBe(18);
  });
  it("counts exclusivity for 90 days", () => {
    const now = new Date("2026-10-25T00:00:00Z");
    expect(isExclusive(new Date("2026-08-01T00:00:00Z"), now)).toBe(true);
    expect(isExclusive(new Date("2026-07-01T00:00:00Z"), now)).toBe(false);
    expect(isExclusive(null, now)).toBe(false);
  });
});

describe("rest-of-series price", () => {
  it("is the percentage of buying one by one, split exactly over the episodes", () => {
    const { total, each } = seriesPrice([30, 30, 30, 30], 70);
    expect(total).toBe(84);
    expect(each.reduce((a, b) => a + b, 0)).toBe(84);
    expect(each).toEqual([21, 21, 21, 21]);
  });
  it("hands leftover credits to the earliest episodes", () => {
    const { total, each } = seriesPrice([25, 25, 25], 70);
    expect(total).toBe(53);
    expect(each).toEqual([18, 18, 17]);
  });
  it("costs nothing for nothing", () => {
    expect(seriesPrice([], 70)).toEqual({ total: 0, each: [] });
  });
});

describe("packs and payouts", () => {
  it("never sells a credit for more than the base rate of ฿1 = 3", () => {
    for (const pack of PACKS) expect(pack.priceSatang / (pack.credits + pack.bonus)).toBeLessThanOrEqual(100 / 3 + 0.01);
  });
  it("starts payouts at ฿500 of earned credits", () => {
    expect(MIN_PAYOUT_CREDITS).toBe(1667);
  });
  it("writes baht the way people read it", () => {
    expect(satangToBaht(9_900)).toBe("฿99");
    expect(satangToBaht(50_010)).toBe("฿500.10");
  });
});

describe("seller checks", () => {
  const withCheckDigit = (twelve: string) => {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(twelve[i]) * (13 - i);
    return twelve + String((11 - (sum % 11)) % 10);
  };
  it("accepts a mobile number or a valid citizen ID", () => {
    expect(normalizePromptPay("081-234-5678")).toBe("0812345678");
    const id = withCheckDigit("110170020341");
    expect(citizenIdValid(id)).toBe(true);
    expect(normalizePromptPay(id)).toBe(id);
  });
  it("refuses anything else", () => {
    expect(normalizePromptPay("12345")).toBeNull();
    const id = withCheckDigit("110170020341");
    const wrong = id.slice(0, 12) + String((Number(id[12]) + 1) % 10);
    expect(normalizePromptPay(wrong)).toBeNull();
  });
  it("counts age to the day", () => {
    const now = new Date("2026-10-25T12:00:00Z");
    expect(ageOn("2006-10-25", now)).toBe(20);
    expect(ageOn("2006-10-26", now)).toBe(19);
  });
});

describe("referral cookie", () => {
  const now = Date.parse("2026-10-25T12:00:00Z");
  it("remembers a creator's link for 30 days", () => {
    const cookie = writeRefCookie(withReferral({}, "user_a", now));
    const map = readRefCookie(cookie, now);
    expect(isDirect(map, "user_a", now)).toBe(true);
    expect(isDirect(map, "user_b", now)).toBe(false);
    expect(isDirect(readRefCookie(cookie, now + 31 * 86_400_000), "user_a", now + 31 * 86_400_000)).toBe(false);
  });
  it("ignores a cookie this server did not sign", () => {
    const cookie = writeRefCookie(withReferral({}, "user_a", now));
    const [body] = cookie.split(".");
    expect(readRefCookie(`${body}.forged`, now)).toEqual({});
    const forgedBody = Buffer.from(JSON.stringify({ user_b: now / 1000 })).toString("base64url");
    expect(readRefCookie(`${forgedBody}.${cookie.split(".")[1]}`, now)).toEqual({});
  });
});
