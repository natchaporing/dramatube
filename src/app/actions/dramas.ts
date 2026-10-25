"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { series } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { setInMyList } from "@/lib/dramas";

/** Save a series to My List, or take it off. Returns the new state. */
export async function setMyListAction(seriesId: string, saved: boolean): Promise<{ saved: boolean } | { error: "signin" | "not_found" }> {
  const user = await currentUser();
  if (!user) return { error: "signin" };
  const [row] = await db.select({ id: series.id }).from(series).where(eq(series.id, String(seriesId))).limit(1);
  if (!row) return { error: "not_found" };
  await setInMyList(user.id, row.id, Boolean(saved));
  revalidatePath("/my-list");
  return { saved: Boolean(saved) };
}
