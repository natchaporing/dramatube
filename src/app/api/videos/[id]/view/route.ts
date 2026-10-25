import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/origin";
import { recordView } from "@/lib/social";
import { getWatchable } from "@/lib/videos";
import { checkViewTicket, issueAnonId, networkKey, readAnonId } from "@/lib/views";

const VIEWER_COOKIE = "dt_vk";

/**
 * Count a view. The player asks once it has played for a while; this route
 * decides whether that is true (see `lib/views.ts`). A signed-out viewer is
 * told apart by an id this server signed; nothing else about them is kept
 * but a keyed hash of their network, for the daily cap.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/videos/[id]/view">) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  const user = await currentUser();
  const video = await getWatchable(id, user);
  if (!video || video.status !== "ready") return new Response("Not found", { status: 404 });

  let ticket: unknown;
  try {
    ticket = ((await request.json()) as { ticket?: unknown }).ticket;
  } catch {
    ticket = null;
  }
  if (!checkViewTicket(ticket, video.id, video.durationSec)) return Response.json({ counted: false });

  let key: string;
  if (user) {
    key = `u:${user.id}`;
  } else {
    const store = await cookies();
    let anon = readAnonId(store.get(VIEWER_COOKIE)?.value);
    if (!anon) {
      const issued = issueAnonId();
      anon = readAnonId(issued)!;
      store.set(VIEWER_COOKIE, issued, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    key = `a:${anon}`;
  }

  const counted = await recordView(video.id, {
    key,
    userId: user?.id ?? null,
    networkKey: user ? null : networkKey(request),
  });
  return Response.json({ counted });
}
