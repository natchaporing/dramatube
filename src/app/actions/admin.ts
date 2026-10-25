"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { dismissReports, removeVideo, restoreVideo } from "@/lib/moderation";

export async function removeVideoAction(form: FormData) {
  await requireAdmin();
  await removeVideo(String(form.get("videoId") ?? ""), String(form.get("reason") ?? ""));
  revalidatePath("/", "layout");
}

export async function dismissReportsAction(form: FormData) {
  await requireAdmin();
  await dismissReports(String(form.get("videoId") ?? ""));
  revalidatePath("/admin");
}

export async function restoreVideoAction(form: FormData) {
  await requireAdmin();
  await restoreVideo(String(form.get("videoId") ?? ""));
  revalidatePath("/", "layout");
}
