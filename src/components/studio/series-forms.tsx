"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { createSeriesAction, updateSeriesAction, type FormState } from "@/app/actions/studio";
import { LIMITS } from "@/lib/catalog";
import type { MessageKey } from "@/lib/i18n";
import { MAX_TROPES, TROPES, tropeSlug } from "@/lib/tropes";
import { useT } from "../i18n";
import { keepFields } from "./keep-fields";

export function NewSeriesForm() {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(createSeriesAction, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} onSubmit={keepFields(action)} className="space-y-3 rounded-xl bg-surface p-4">
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

export interface SeriesFormValues {
  id: string;
  title: string;
  description: string;
  hasPoster: boolean;
  tropes: string[];
  status: "ongoing" | "completed";
  plannedEpisodes: number | null;
  /** "YYYY-MM-DD", Bangkok time, or "" for none. */
  premiereDate: string;
}

/**
 * Everything a series is shelved by: its name and blurb, the poster, the
 * tropes that decide which shelves it sits on, whether it is still coming
 * out, how long it will run, and when it premieres if it has not yet.
 */
export function EditSeriesForm({ initial }: { initial: SeriesFormValues }) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(updateSeriesAction, null);
  const [tropes, setTropes] = useState<string[]>(initial.tropes);
  const toggle = (trope: string) =>
    setTropes((current) =>
      current.includes(trope) ? current.filter((item) => item !== trope) : current.length < MAX_TROPES ? [...current, trope] : current,
    );
  return (
    <form onSubmit={keepFields(action)} className="space-y-3" data-testid="series-details">
      <input type="hidden" name="seriesId" value={initial.id} />
      <input name="title" required maxLength={LIMITS.seriesTitle} defaultValue={initial.title} className="field font-medium" />
      <textarea name="description" rows={2} maxLength={LIMITS.description} defaultValue={initial.description} className="field" />

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label text-xs">{t("studio.seriesStatus")}</span>
          <select name="status" defaultValue={initial.status} className="field">
            <option value="ongoing">{t("drama.ongoing")}</option>
            <option value="completed">{t("drama.completed")}</option>
          </select>
        </label>
        <label className="block">
          <span className="label text-xs">{t("studio.seriesPlanned")}</span>
          <input
            name="plannedEpisodes"
            type="number"
            min={1}
            max={LIMITS.plannedEpisodes}
            defaultValue={initial.plannedEpisodes ?? ""}
            placeholder={t("common.optional")}
            className="field"
          />
        </label>
        <label className="block">
          <span className="label text-xs">{t("studio.seriesPremiere")}</span>
          <input name="premiereAt" type="date" defaultValue={initial.premiereDate} className="field" />
        </label>
      </div>
      <p className="hint">{t("studio.seriesPremiereHint")}</p>

      <div>
        <span className="label text-xs">
          {t("studio.seriesTropes")} <span className="font-normal text-faint">{t("studio.seriesTropesCount", { count: tropes.length, max: MAX_TROPES })}</span>
        </span>
        <input type="hidden" name="tropesField" value="1" />
        {tropes.map((trope) => (
          <input key={trope} type="hidden" name="tropes" value={trope} />
        ))}
        <div className="flex flex-wrap gap-1.5">
          {TROPES.map((trope) => {
            const on = tropes.includes(trope);
            return (
              <button
                key={trope}
                type="button"
                onClick={() => toggle(trope)}
                aria-pressed={on}
                disabled={!on && tropes.length >= MAX_TROPES}
                className={clsx(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-40",
                  on ? "border-brand bg-brand/15 text-text" : "border-line text-muted hover:border-line-bright hover:text-text",
                )}
              >
                {t(`trope.${tropeSlug(trope)}` as MessageKey)}
              </button>
            );
          })}
        </div>
        <p className="hint mt-1">{t("studio.seriesTropesHint")}</p>
      </div>

      <div>
        <span className="label text-xs">{t("studio.seriesPoster")}</span>
        <input name="poster" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-raised file:px-3 file:py-1.5 file:text-text" />
        <p className="hint mt-1">{t("studio.seriesPosterHint")}</p>
        {initial.hasPoster && (
          <label className="mt-1 flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" name="removePoster" /> {t("studio.seriesPosterRemove")}
          </label>
        )}
      </div>

      {state?.error && (
        <p className="text-sm text-bad" role="alert">
          {t(`studio.seriesError.${state.error}` as MessageKey)}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        {state?.ok && !pending && <span className="text-xs text-good">{t("studio.saved")}</span>}
        <button className="btn btn-ghost h-8 text-xs" disabled={pending} data-testid="save-series">
          {t("studio.save")}
        </button>
      </div>
    </form>
  );
}
