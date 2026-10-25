"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { PublishError, deleteVideo, publishVideo, updateVideo, type ImageInput } from "@/lib/publish";
import { StudioError, createSeries, deleteSeries, updateChannel, updateSeries } from "@/lib/studio";
import { createToken, revokeToken } from "@/lib/tokens";

export type FormState = { error?: string; detail?: string; ok?: number } | null;

async function imageFrom(form: FormData, name: string): Promise<ImageInput | null> {
  const file = form.get(name);
  if (!(file instanceof File) || file.size === 0) return null;
  return { data: Buffer.from(await file.arrayBuffer()) };
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function details(form: FormData) {
  return {
    title: text(form, "title"),
    description: text(form, "description"),
    visibility: text(form, "visibility") as "public",
    category: text(form, "category") as "other",
    tags: text(form, "tags"),
    aiUsage: text(form, "aiUsage") as "generated",
    aiModels: form.getAll("aiModels").filter((value): value is string => typeof value === "string"),
    prompt: text(form, "prompt"),
    seriesId: text(form, "seriesId") || null,
    episodeNumber: text(form, "episodeNumber") || null,
  };
}

export async function publishAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  let id: string;
  try {
    const video = await publishVideo(
      user.id,
      {
        ...details(form),
        uploadId: text(form, "uploadId"),
        clientDurationSec: text(form, "clientDurationSec") || null,
        clientWidth: text(form, "clientWidth") || null,
        clientHeight: text(form, "clientHeight") || null,
      },
      await imageFrom(form, "thumbnail"),
    );
    id = video.id;
  } catch (error) {
    if (error instanceof PublishError) return { error: error.code, detail: error.detail };
    throw error;
  }
  revalidatePath("/", "layout");
  redirect(`/watch/${id}`);
}

export async function updateVideoAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = text(form, "videoId");
  try {
    await updateVideo(user.id, id, details(form), await imageFrom(form, "thumbnail"));
  } catch (error) {
    if (error instanceof PublishError) return { error: error.code, detail: error.detail };
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: Date.now() };
}

export async function deleteVideoAction(form: FormData) {
  const user = await requireUser();
  await deleteVideo(user.id, text(form, "videoId"));
  revalidatePath("/", "layout");
  redirect("/studio");
}

export async function createSeriesAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await createSeries(user.id, text(form, "title"), text(form, "description"));
  } catch (error) {
    if (error instanceof StudioError) return { error: error.message };
    throw error;
  }
  revalidatePath("/studio/series");
  return { ok: Date.now() };
}

export async function updateSeriesAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await updateSeries(user.id, text(form, "seriesId"), text(form, "title"), text(form, "description"));
  } catch (error) {
    if (error instanceof StudioError) return { error: error.message };
    throw error;
  }
  revalidatePath("/studio/series");
  return { ok: Date.now() };
}

export async function deleteSeriesAction(form: FormData) {
  const user = await requireUser();
  await deleteSeries(user.id, text(form, "seriesId"));
  revalidatePath("/studio/series");
}

export async function updateChannelAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await updateChannel(user.id, {
      name: text(form, "name"),
      handle: text(form, "handle"),
      bio: text(form, "bio"),
      avatar: await imageFrom(form, "avatar"),
      banner: await imageFrom(form, "banner"),
      removeAvatar: text(form, "removeAvatar") === "1",
      removeBanner: text(form, "removeBanner") === "1",
    });
  } catch (error) {
    if (error instanceof StudioError) return { error: error.message };
    if (error instanceof PublishError) return { error: error.code };
    throw error;
  }
  revalidatePath("/", "layout");
  return { ok: Date.now() };
}

export type TokenState = { token?: string; error?: string } | null;

export async function createTokenAction(_prev: TokenState, form: FormData): Promise<TokenState> {
  const user = await requireUser();
  const { token } = await createToken(user.id, text(form, "name"));
  revalidatePath("/studio/api");
  return { token };
}

export async function revokeTokenAction(form: FormData) {
  const user = await requireUser();
  await revokeToken(user.id, text(form, "tokenId"));
  revalidatePath("/studio/api");
}
