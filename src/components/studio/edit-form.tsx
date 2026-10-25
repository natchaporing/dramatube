"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, ImagePlus } from "lucide-react";
import { updateVideoAction, type FormState } from "@/app/actions/studio";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "../i18n";
import { DetailsFields, type DetailsValues } from "./details-fields";

export function EditVideoForm({
  videoId,
  initial,
  seriesOptions,
  thumbnailUrl,
}: {
  videoId: string;
  initial: DetailsValues;
  seriesOptions: Array<{ id: string; title: string }>;
  thumbnailUrl: string | null;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(updateVideoAction, null);
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="videoId" value={videoId} />
      <DetailsFields initial={initial} seriesOptions={seriesOptions} />
      <div>
        <span className="label">{t("upload.thumbnail")}</span>
        <div className="flex items-center gap-4">
          <div className="aspect-video w-48 overflow-hidden rounded-lg bg-raised">
            {(preview ?? thumbnailUrl) && <img src={preview ?? thumbnailUrl!} alt="" className="h-full w-full object-cover" />}
          </div>
          <label className="btn btn-ghost cursor-pointer">
            <ImagePlus size={16} /> {t("studio.replaceThumbnail")}
            <input
              type="file"
              name="thumbnail"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setPreview(file ? URL.createObjectURL(file) : null);
              }}
            />
          </label>
        </div>
      </div>
      {state?.error && (
        <p className="rounded-md bg-bad-dim px-3 py-2 text-sm text-bad" role="alert">
          {t(`upload.error.${state.error}` as MessageKey, { detail: state.detail ?? "" })}
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

export function ConfirmButton({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
