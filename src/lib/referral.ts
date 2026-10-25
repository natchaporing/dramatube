import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { REFERRAL_DAYS } from "./money";

/**
 * "Direct" sales: a viewer who arrived through a creator's own link
 * (`?ref=<handle>`) buys at the creator's 70% rate from that creator for 30
 * days. Signed-in viewers are remembered in the database; anyone else in a
 * signed cookie, so the attribution survives signing up in between.
 *
 * The cookie is signed so nobody can write themselves into it — a viewer has
 * no reason to, but a creator might, to turn every sale direct.
 */
export const REF_COOKIE = "dt_ref";
const MAX_ENTRIES = 20;

function mac(value: string) {
  const key = createHmac("sha256", env.authSecret).update("dramatube:ref").digest();
  return createHmac("sha256", key).update(value).digest("base64url").slice(0, 27);
}

/** channelId → seconds since the epoch when the viewer arrived through that creator's link. */
export type RefMap = Record<string, number>;

export function readRefCookie(value: string | undefined, now = Date.now()): RefMap {
  if (!value) return {};
  const [body, signature] = value.split(".");
  if (!body || !signature) return {};
  const expected = mac(body);
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return {};
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as RefMap;
    const cutoff = now / 1000 - REFERRAL_DAYS * 86_400;
    return Object.fromEntries(
      Object.entries(parsed).filter(([key, at]) => typeof key === "string" && typeof at === "number" && at > cutoff),
    );
  } catch {
    return {};
  }
}

export function writeRefCookie(map: RefMap): string {
  const newest = Object.entries(map)
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_ENTRIES);
  const body = Buffer.from(JSON.stringify(Object.fromEntries(newest))).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function withReferral(map: RefMap, channelId: string, now = Date.now()): RefMap {
  return { ...map, [channelId]: Math.floor(now / 1000) };
}

export function isDirect(map: RefMap, channelId: string, now = Date.now()): boolean {
  const at = map[channelId];
  return typeof at === "number" && at > now / 1000 - REFERRAL_DAYS * 86_400;
}
