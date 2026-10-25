"use client";

import { useActionState, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { updateChannelAction, type FormState } from "@/app/actions/studio";
import { LIMITS } from "@/lib/catalog";
import { Avatar } from "../avatar";
import { useT } from "../i18n";
import { keepFields } from "./keep-fields";

export function ChannelForm({
  name,
  handle,
  bio,
  avatarUrl,
  bannerUrl,
}: {
  name: string;
  handle: string;
  bio: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(updateChannelAction, null);
  const [avatar, setAvatar] = useState(avatarUrl);
  const [banner, setBanner] = useState(bannerUrl);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [removeBanner, setRemoveBanner] = useState(false);
  // "Remove" has to forget a file chosen a moment ago, or it would be uploaded anyway.
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const error = state?.error
    ? state.error === "handle_taken" || state.error === "handle_invalid"
      ? t(`auth.error.${state.error}`)
      : state.error === "bad_thumbnail"
        ? t("upload.error.bad_thumbnail")
        : t("common.error")
    : null;

  return (
    <form onSubmit={keepFields(action)} className="max-w-2xl space-y-8">
      <input type="hidden" name="removeAvatar" value={removeAvatar ? "1" : "0"} />
      <input type="hidden" name="removeBanner" value={removeBanner ? "1" : "0"} />

      <section>
        <span className="label">{t("studio.banner")}</span>
        <div className="aspect-[4/1] overflow-hidden rounded-xl bg-raised">{banner && <img src={banner} alt="" className="h-full w-full object-cover" />}</div>
        <p className="hint">{t("studio.bannerHint")}</p>
        <div className="mt-2 flex gap-2">
          <label className="btn btn-ghost h-8 cursor-pointer text-xs">
            {t("upload.customThumbnail")}
            <input
              ref={bannerInput}
              type="file"
              name="banner"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  setBanner(URL.createObjectURL(file));
                  setRemoveBanner(false);
                }
              }}
            />
          </label>
          {banner && (
            <button type="button" className="btn btn-quiet h-8 text-xs" onClick={() => {
                if (bannerInput.current) bannerInput.current.value = "";
                setBanner(null);
                setRemoveBanner(true);
              }}>
              {t("studio.removeImage")}
            </button>
          )}
        </div>
      </section>

      <section className="flex items-center gap-5">
        <Avatar name={name} handle={handle} url={avatar} size={96} />
        <div>
          <span className="label">{t("studio.avatar")}</span>
          <p className="hint mb-2">{t("studio.avatarHint")}</p>
          <div className="flex gap-2">
            <label className="btn btn-ghost h-8 cursor-pointer text-xs">
              {t("upload.customThumbnail")}
              <input
                ref={avatarInput}
                type="file"
                name="avatar"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    setAvatar(URL.createObjectURL(file));
                    setRemoveAvatar(false);
                  }
                }}
              />
            </label>
            {avatar && (
              <button type="button" className="btn btn-quiet h-8 text-xs" onClick={() => {
                  if (avatarInput.current) avatarInput.current.value = "";
                  setAvatar(null);
                  setRemoveAvatar(true);
                }}>
                {t("studio.removeImage")}
              </button>
            )}
          </div>
        </div>
      </section>

      <label className="block">
        <span className="label">{t("auth.name")}</span>
        <input name="name" required maxLength={LIMITS.channelName} defaultValue={name} className="field" />
      </label>
      <label className="block">
        <span className="label">{t("auth.handle")}</span>
        <div className="flex items-center rounded-md border border-line bg-surface focus-within:border-line-bright">
          <span className="pl-3 text-sm text-faint">@</span>
          <input name="handle" required maxLength={30} defaultValue={handle} className="w-full bg-transparent px-1 py-2 text-sm text-text focus:outline-none" />
        </div>
        <span className="hint block">{t("auth.handleHint")}</span>
      </label>
      <label className="block">
        <span className="label">{t("studio.bio")}</span>
        <textarea name="bio" rows={5} maxLength={LIMITS.bio} defaultValue={bio} className="field" />
      </label>

      {error && (
        <p className="rounded-md bg-bad-dim px-3 py-2 text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-3 border-t border-line pt-6">
        {state?.ok && !pending && (
          <span className="flex items-center gap-1.5 text-sm text-good">
            <CheckCircle2 size={16} /> {t("studio.saved")}
          </span>
        )}
        <button className="btn btn-primary px-6" disabled={pending}>
          {t("studio.save")}
        </button>
      </div>
    </form>
  );
}

