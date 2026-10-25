import { apiError, apiUser } from "@/lib/api";
import { StudioError, createSeries } from "@/lib/studio";
import { listSeries } from "@/lib/videos";

/** Your series, so a tool can file an episode into the right one. */
export async function GET(request: Request) {
  const user = await apiUser(request, false);
  if (!user) return apiError(401, "unauthenticated");
  const list = await listSeries(user.id, true);
  return Response.json({ series: list.map(({ id, title, description, episodeCount }) => ({ id, title, description, episodeCount })) });
}

/** `{ "title": "...", "description": "..." }` → the new series. */
export async function POST(request: Request) {
  const user = await apiUser(request, false);
  if (!user) return apiError(401, "unauthenticated");
  let body: { title?: unknown; description?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "invalid", "Body must be JSON.");
  }
  try {
    const row = await createSeries(user.id, String(body.title ?? ""), String(body.description ?? ""));
    return Response.json({ id: row.id, title: row.title, description: row.description }, { status: 201 });
  } catch (error) {
    if (error instanceof StudioError) return apiError(422, "invalid", "title is required");
    throw error;
  }
}
