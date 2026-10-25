import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/origin";
import { recordView } from "@/lib/social";
import { getWatchable } from "@/lib/videos";

const VIEWER_COOKIE = "dt_vk";

/**
 * Count a view. The player calls this once it has actually played for a
 * while, not on page load, so a bounce is not a view. A signed-out viewer is
 * told apart by an opaque cookie; nothing about them is stored but that.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/videos/[id]/view">) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  const user = await currentUser();
  const video = await getWatchable(id, user);
  if (!video || video.status !== "ready") return new Response("Not found", { status: 404 });

  const store = await cookies();
  let viewerKey = user ? `u:${user.id}` : store.get(VIEWER_COOKIE)?.value;
  if (!viewerKey || !/^[A-Za-z0-9_:-]{8,80}$/.test(viewerKey)) {
    viewerKey = `a:${randomBytes(12).toString("base64url")}`;
  }
  if (!user) {
    store.set(VIEWER_COOKIE, viewerKey, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  const counted = await recordView(id, viewerKey, user?.id ?? null);
  return Response.json({ counted });
}
