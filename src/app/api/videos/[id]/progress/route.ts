import { currentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/origin";
import { saveProgress } from "@/lib/social";
import { getWatchable } from "@/lib/videos";

/** Where a signed-in viewer stopped, so the video resumes there. */
export async function POST(request: Request, ctx: RouteContext<"/api/videos/[id]/progress">) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const user = await currentUser();
  if (!user) return new Response(null, { status: 204 });
  const { id } = await ctx.params;
  let position: number;
  try {
    position = Number(((await request.json()) as { position?: unknown }).position);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!Number.isFinite(position) || position < 0) return new Response("Bad request", { status: 400 });
  if (!(await getWatchable(id, user))) return new Response("Not found", { status: 404 });
  await saveProgress(user.id, id, position);
  return new Response(null, { status: 204 });
}
