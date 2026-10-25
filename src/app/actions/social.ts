"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/session";
import { REPORT_REASONS, type ReportReason } from "@/lib/catalog";
import {
  CommentError,
  addComment,
  clearHistory,
  deleteComment,
  fileReport,
  setReaction,
  setSubscription,
} from "@/lib/social";
import { getWatchable } from "@/lib/videos";

/*
 * Every action re-checks who is asking: a Server Action is a public POST
 * endpoint whatever button it was written for.
 */

export async function reactAction(videoId: string, pressed: 1 | -1) {
  const user = await currentUser();
  if (!user) return { error: "signin" as const };
  if (pressed !== 1 && pressed !== -1) return { error: "invalid" as const };
  if (!(await getWatchable(videoId, user))) return { error: "not_found" as const };
  return setReaction(user.id, videoId, pressed);
}

export async function subscribeAction(channelId: string, subscribe: boolean) {
  const user = await currentUser();
  if (!user) return { error: "signin" as const };
  if (user.id === channelId) return { error: "self" as const };
  const result = await setSubscription(user.id, channelId, Boolean(subscribe));
  revalidatePath("/", "layout");
  return result;
}

export type CommentState = { error?: string; ok?: number } | null;

export async function commentAction(_prev: CommentState, form: FormData): Promise<CommentState> {
  const user = await currentUser();
  if (!user) return { error: "signin" };
  const videoId = String(form.get("videoId") ?? "");
  const parentId = String(form.get("parentId") ?? "") || null;
  if (!(await getWatchable(videoId, user))) return { error: "not_found" };
  try {
    await addComment(user.id, videoId, String(form.get("body") ?? ""), parentId);
  } catch (error) {
    if (error instanceof CommentError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/watch/${videoId}`);
  return { ok: Date.now() };
}

export async function deleteCommentAction(commentId: string, videoId: string) {
  const user = await currentUser();
  if (!user) return;
  await deleteComment(user.id, commentId, isAdmin(user));
  revalidatePath(`/watch/${videoId}`);
}

export async function reportAction(videoId: string, reason: string, details: string) {
  const user = await currentUser();
  // Signed-in only: an anonymous report button is a spam cannon aimed at moderators.
  if (!user) return { error: "signin" as const };
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) return { error: "invalid" as const };
  if (!(await getWatchable(videoId, user))) return { error: "not_found" as const };
  await fileReport({ videoId, reporterId: user.id, reason: reason as ReportReason, details: String(details ?? "") });
  return { ok: true as const };
}

export async function clearHistoryAction() {
  const user = await currentUser();
  if (!user) return;
  await clearHistory(user.id);
  revalidatePath("/feed/history");
}
