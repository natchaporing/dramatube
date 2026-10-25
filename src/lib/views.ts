import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * What makes a view count, decided on the server.
 *
 * The player asks to count a view after real playback, but a browser can be
 * made to ask for anything, so three things are checked here instead of
 * trusted there:
 *
 * - **A ticket.** The watch page hands the player a signed timestamp for this
 *   video. A view is counted only once the ticket is old enough for the
 *   playback rule to have been met, and not older than half a day.
 * - **Who is watching.** Signed-in viewers are their account. Anyone else is an
 *   id this server issued and signed; a cookie it did not sign is ignored, so
 *   nobody can choose their own key or borrow someone else's.
 * - **Where from.** Anonymous views of one video from one network count at
 *   most `IP_DAILY_CAP` times a day. Clearing cookies in a loop gets a script
 *   twenty views, not twenty thousand. The cap is generous because mobile
 *   carriers put many real people behind one address.
 */

export const IP_DAILY_CAP = 20;
const TICKET_MAX_AGE_SEC = 12 * 60 * 60;

function key(purpose: string) {
  return createHmac("sha256", env.authSecret).update(`dramatube:${purpose}`).digest();
}

function mac(purpose: string, value: string) {
  return createHmac("sha256", key(purpose)).update(value).digest("base64url").slice(0, 27);
}

function sameMac(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** The shortest playback that counts as a view: 30%, between 2 and 10 seconds. */
export function minWatchSeconds(durationSec: number): number {
  return Math.min(10, Math.max(2, (durationSec || 0) * 0.3));
}

export function issueViewTicket(videoId: string, now = Date.now()): string {
  const issued = Math.floor(now / 1000);
  return `${issued}.${mac("ticket", `${videoId}.${issued}`)}`;
}

export function checkViewTicket(ticket: unknown, videoId: string, durationSec: number, now = Date.now()): boolean {
  if (typeof ticket !== "string") return false;
  const [issuedText, signature] = ticket.split(".");
  const issued = Number(issuedText);
  if (!Number.isInteger(issued) || !signature) return false;
  if (!sameMac(signature, mac("ticket", `${videoId}.${issued}`))) return false;
  const age = now / 1000 - issued;
  // One second of slack for clocks and rounding between the page and the request.
  return age >= minWatchSeconds(durationSec) - 1 && age <= TICKET_MAX_AGE_SEC;
}

export function issueAnonId(): string {
  const id = randomBytes(12).toString("base64url");
  return `${id}.${mac("anon", id)}`;
}

/** The id inside a signed anonymous cookie, or null if this server did not sign it. */
export function readAnonId(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const [id, signature] = cookie.split(".");
  if (!id || !signature || !/^[A-Za-z0-9_-]{16}$/.test(id)) return null;
  return sameMac(signature, mac("anon", id)) ? id : null;
}

/** A keyed hash of the client's address: enough to cap, not enough to identify. */
export function networkKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  return mac("network", address).slice(0, 22);
}
