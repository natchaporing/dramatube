import { cookies } from "next/headers";
import { db } from "@/db";
import { referrals } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { normalizeHandle } from "@/lib/handles";
import { sameOrigin } from "@/lib/origin";
import { REF_COOKIE, readRefCookie, withReferral, writeRefCookie } from "@/lib/referral";
import { channelByHandle } from "@/lib/videos";

/**
 * A viewer opened a creator's own link (`?ref=<handle>`). From now and for
 * 30 days, what they buy from that creator is a direct sale. Remembered in a
 * signed cookie, and on the account too when the viewer is signed in, so it
 * follows them to another device.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  let handle: string;
  try {
    handle = normalizeHandle(String(((await request.json()) as { handle?: unknown }).handle ?? ""));
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const channel = handle ? await channelByHandle(handle) : null;
  if (!channel) return Response.json({ recorded: false });

  const user = await currentUser();
  // A creator's own visits through their own link are not a referral.
  if (user?.id === channel.id) return Response.json({ recorded: false });
  if (user) {
    await db
      .insert(referrals)
      .values({ userId: user.id, channelId: channel.id })
      .onConflictDoUpdate({ target: [referrals.userId, referrals.channelId], set: { at: new Date() } });
  }
  const store = await cookies();
  const map = withReferral(readRefCookie(store.get(REF_COOKIE)?.value), channel.id);
  store.set(REF_COOKIE, writeRefCookie(map), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return Response.json({ recorded: true });
}
