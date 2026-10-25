"use client";

import { useState } from "react";
import clsx from "clsx";
import { Plus, Sparkles, X } from "lucide-react";
import { AI_USAGE, CATEGORIES, KNOWN_MODELS, LIMITS, MAX_MODELS, VISIBILITIES, canonicalModel } from "@/lib/catalog";
import { useT } from "../i18n";

export interface DetailsValues {
  title: string;
  description: string;
  visibility: (typeof VISIBILITIES)[number];
  category: string;
  tags: string[];
  aiUsage: (typeof AI_USAGE)[number];
  aiModels: string[];
  prompt: string | null;
  seriesId: string | null;
  episodeNumber: number | null;
}

/**
 * The fields a video carries, shared by the upload page and the edit page so
 * the two can never ask for different things. Plain named inputs: the form
 * around them posts straight to a Server Action.
 */
export function DetailsFields({
  initial,
  seriesOptions,
}: {
  initial: DetailsValues;
  seriesOptions: Array<{ id: string; title: string }>;
}) {
  const t = useT();
  const [models, setModels] = useState<string[]>(initial.aiModels);
  const [custom, setCustom] = useState("");
  const [seriesId, setSeriesId] = useState(initial.seriesId ?? "");
  const [title, setTitle] = useState(initial.title);

  const addModel = (name: string) => {
    const model = canonicalModel(name);
    if (!model || models.length >= MAX_MODELS) return;
    if (models.some((existing) => existing.toLowerCase() === model.toLowerCase())) return;
    setModels([...models, model]);
  };

  return (
    <div className="space-y-6">
      <label className="block">
        <span className="label">{t("upload.titleField")}</span>
        <input
          name="title"
          required
          maxLength={LIMITS.title}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="field"
        />
        <span className="hint flex justify-between">
          <span>{t("upload.titleHint")}</span>
          <span>
            {title.length}/{LIMITS.title}
          </span>
        </span>
      </label>

      <label className="block">
        <span className="label">{t("upload.description")}</span>
        <textarea
          name="description"
          rows={5}
          maxLength={LIMITS.description}
          defaultValue={initial.description}
          placeholder={t("upload.descriptionHint")}
          className="field"
        />
      </label>

      <fieldset className="rounded-xl border border-ai/25 bg-ai-dim/40 p-4">
        <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-ai">
          <Sparkles size={16} /> {t("upload.ai")}
        </legend>
        <p className="mb-3 text-xs text-muted">{t("upload.aiHint")}</p>
        <div className="space-y-2">
          {AI_USAGE.map((usage) => (
            <label key={usage} className="flex cursor-pointer items-start gap-3 text-sm text-text">
              <input type="radio" name="aiUsage" value={usage} defaultChecked={initial.aiUsage === usage} className="mt-1" />
              {t(usage === "generated" ? "upload.aiGenerated" : "upload.aiAssisted")}
            </label>
          ))}
        </div>

        <div className="mt-4">
          <span className="label">{t("upload.models")}</span>
          {models.map((model) => (
            <input key={model} type="hidden" name="aiModels" value={model} />
          ))}
          <div className="flex flex-wrap gap-1.5">
            {models.map((model) => (
              <span key={model} className="inline-flex items-center gap-1 rounded-full bg-ai/20 py-1 pl-3 pr-1.5 text-xs font-medium text-ai">
                {model}
                <button type="button" onClick={() => setModels(models.filter((m) => m !== model))} aria-label={`Remove ${model}`}>
                  <X size={14} />
                </button>
              </span>
            ))}
            <input
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addModel(custom);
                  setCustom("");
                }
              }}
              onBlur={() => {
                if (custom.trim()) {
                  addModel(custom);
                  setCustom("");
                }
              }}
              placeholder={t("upload.addModel")}
              className="min-w-32 flex-1 bg-transparent px-1 py-1 text-xs text-text placeholder:text-faint focus:outline-none"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {KNOWN_MODELS.filter((model) => !models.includes(model)).map((model) => (
              <button
                type="button"
                key={model}
                onClick={() => addModel(model)}
                className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-ai/50 hover:text-ai"
              >
                <Plus size={12} /> {model}
              </button>
            ))}
          </div>
          <p className="hint">{t("upload.modelsHint")}</p>
        </div>

        <label className="mt-4 block">
          <span className="label">{t("upload.prompt")}</span>
          <textarea
            name="prompt"
            rows={3}
            maxLength={LIMITS.prompt}
            defaultValue={initial.prompt ?? ""}
            className="field font-mono text-xs"
          />
          <span className="hint block">{t("upload.promptHint")}</span>
        </label>
      </fieldset>

      <fieldset>
        <legend className="label">{t("upload.visibility")}</legend>
        <div className="space-y-2">
          {VISIBILITIES.map((visibility) => (
            <label key={visibility} className="flex cursor-pointer items-center gap-3 text-sm text-text">
              <input type="radio" name="visibility" value={visibility} defaultChecked={initial.visibility === visibility} />
              {t(`upload.visibility.${visibility}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">{t("upload.category")}</span>
          <select name="category" defaultValue={initial.category} className="field">
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(`category.${category}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">{t("upload.tags")}</span>
          <input name="tags" defaultValue={initial.tags.join(", ")} className="field" />
          <span className="hint block">{t("upload.tagsHint")}</span>
        </label>
      </div>

      <div className={clsx("grid gap-4", seriesId && "sm:grid-cols-2")}>
        <label className="block">
          <span className="label">{t("upload.series")}</span>
          <select name="seriesId" value={seriesId} onChange={(event) => setSeriesId(event.target.value)} className="field">
            <option value="">{t("upload.noSeries")}</option>
            {seriesOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        </label>
        {seriesId && (
          <label className="block">
            <span className="label">{t("upload.episode")}</span>
            <input
              name="episodeNumber"
              type="number"
              min={0}
              max={10000}
              defaultValue={initial.episodeNumber ?? ""}
              className="field"
            />
            <span className="hint block">{t("upload.episodeHint")}</span>
          </label>
        )}
      </div>
    </div>
  );
}
