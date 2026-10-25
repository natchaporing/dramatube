"use client";

import { useActionState, useEffect, useRef } from "react";
import { createSeriesAction, updateSeriesAction, type FormState } from "@/app/actions/studio";
import { LIMITS } from "@/lib/catalog";
import { useT } from "../i18n";

export function NewSeriesForm() {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(createSeriesAction, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="space-y-3 rounded-xl bg-surface p-4">
      <div className="text-sm font-semibold text-text">{t("studio.newSeries")}</div>
      <input name="title" required maxLength={LIMITS.seriesTitle} placeholder={t("studio.seriesName")} className="field" />
      <textarea name="description" rows={2} maxLength={LIMITS.description} placeholder={t("studio.seriesDescription")} className="field" />
      <div className="flex justify-end">
        <button className="btn btn-primary" disabled={pending}>
          {t("studio.create")}
        </button>
      </div>
    </form>
  );
}

export function EditSeriesForm({ id, title, description }: { id: string; title: string; description: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(updateSeriesAction, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="seriesId" value={id} />
      <input name="title" required maxLength={LIMITS.seriesTitle} defaultValue={title} className="field font-medium" />
      <textarea name="description" rows={2} maxLength={LIMITS.description} defaultValue={description} className="field" />
      <div className="flex items-center justify-end gap-2">
        {state?.ok && !pending && <span className="text-xs text-good">{t("studio.saved")}</span>}
        <button className="btn btn-ghost h-8 text-xs" disabled={pending}>
          {t("studio.save")}
        </button>
      </div>
    </form>
  );
}
