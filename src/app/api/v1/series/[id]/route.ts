import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { series } from "@/db/schema";
import { SERIES_ERRORS, apiError, apiUser, requestOrigin, seriesBody, seriesJson } from "@/lib/api";
import { StudioError, updateSeries } from "@/lib/studio";

async function own(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(series)
    .where(and(eq(series.id, id), eq(series.channelId, userId)))
    .limit(1);
  return row ?? null;
}

export async function GET(request: Request, ctx: RouteContext<"/api/v1/series/[id]">) {
  const user = await apiUser(request, false);
  if (!user) return apiError(401, "unauthenticated");
  const row = await own(user.id, (await ctx.params).id);
  if (!row) return apiError(404, "not_found");
  return Response.json(seriesJson(row, requestOrigin(request)));
}

/**
 * Change the fields given and keep the rest. `"posterBase64": null` removes
 * the poster, and the first episode's picture stands in again.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/series/[id]">) {
  const user = await apiUser(request, false);
  if (!user) return apiError(401, "unauthenticated");
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError(400, "invalid", "Body must be JSON.");
  }
  const { input, poster, removePoster } = seriesBody(body ?? {});
  try {
    const row = await updateSeries(user.id, (await ctx.params).id, input, poster, removePoster);
    return Response.json(seriesJson(row, requestOrigin(request)));
  } catch (error) {
    if (error instanceof StudioError) {
      return error.message === "not_found" ? apiError(404, "not_found") : apiError(422, "invalid", SERIES_ERRORS[error.message] ?? error.message);
    }
    throw error;
  }
}
