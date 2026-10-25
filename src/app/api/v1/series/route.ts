import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { series } from "@/db/schema";
import { SERIES_ERRORS, apiError, apiUser, requestOrigin, seriesBody, seriesJson } from "@/lib/api";
import { StudioError, createSeries } from "@/lib/studio";

/** Your series, so a tool can file an episode into the right one. */
export async function GET(request: Request) {
  const user = await apiUser(request, false);
  if (!user) return apiError(401, "unauthenticated");
  const rows = await db
    .select({
      series,
      // Spelled out: a bare "id" in the subquery would be the video's.
      episodeCount: sql<number>`(select count(*)::int from videos v where v.series_id = "series"."id" and v.visibility = 'public' and v.status = 'ready')`,
    })
    .from(series)
    .where(eq(series.channelId, user.id))
    .orderBy(desc(series.updatedAt));
  const origin = requestOrigin(request);
  return Response.json({ series: rows.map((row) => seriesJson(row.series, origin, row.episodeCount)) });
}

/**
 * `{ "title": "...", "description": "...", "tropes": ["Hidden Identity"],
 *    "status": "ongoing", "plannedEpisodes": 40, "premiereAt": "2026-11-20",
 *    "posterBase64": "<2:3 jpeg/png/webp>" }` → the new series.
 * Only `title` is required. Unknown tropes are dropped; up to five are kept.
 */
export async function POST(request: Request) {
  const user = await apiUser(request, false);
  if (!user) return apiError(401, "unauthenticated");
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError(400, "invalid", "Body must be JSON.");
  }
  const { input, poster } = seriesBody(body ?? {});
  try {
    const row = await createSeries(user.id, { ...input, title: input.title ?? "" }, poster);
    return Response.json(seriesJson(row, requestOrigin(request), 0), { status: 201 });
  } catch (error) {
    if (error instanceof StudioError) return apiError(422, "invalid", SERIES_ERRORS[error.message] ?? error.message);
    throw error;
  }
}
