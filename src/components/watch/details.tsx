"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { Sparkles } from "lucide-react";
import { useI18n } from "../i18n";
import { useAutoplay } from "./player";
import { RichText } from "./rich-text";

/**
 * The description box: views and date on top, the text folded to three
 * lines until asked, and the AI credits in it rather than under it — the
 * disclosure is part of what the video is, not a footnote below the fold.
 */
export function DescriptionBox({
  stats,
  description,
  tags,
  category,
  categoryLabel,
  aiUsage,
  aiModels,
  prompt,
  sourceApp,
}: {
  stats: string;
  description: string;
  tags: string[];
  category: string;
  categoryLabel: string;
  aiUsage: "generated" | "assisted";
  aiModels: string[];
  prompt: string | null;
  sourceApp: string | null;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const long = description.length > 280 || description.split("\n").length > 3;

  return (
    <div className="rounded-xl bg-raised p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 font-medium text-text">
        <span>{stats}</span>
        {tags.slice(0, 3).map((tag) => (
          <Link key={tag} href={`/search?q=${encodeURIComponent(tag)}`} className="text-[#8ab4ff] hover:underline">
            #{tag}
          </Link>
        ))}
      </div>

      <div className="mt-3 rounded-lg border border-ai/25 bg-ai-dim/60 p-3">
        <div className="flex items-center gap-2 font-medium text-ai">
          <Sparkles size={16} />
          {t(aiUsage === "generated" ? "watch.disclosureGenerated" : "watch.disclosureAssisted")}
        </div>
        {aiModels.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">{t("watch.madeWith")}</span>
            {aiModels.map((model) => (
              <Link
                key={model}
                href={`/search?model=${encodeURIComponent(model)}`}
                className="rounded-full border border-ai/30 px-2.5 py-0.5 text-xs font-medium text-ai hover:bg-ai/15"
              >
                {model}
              </Link>
            ))}
          </div>
        )}
        {sourceApp && <div className="mt-2 text-xs text-muted">{t("watch.publishedFrom", { app: sourceApp })}</div>}
        {prompt && (
          <div className="mt-2">
            <button className="text-xs font-medium text-ai hover:underline" onClick={() => setShowPrompt((value) => !value)}>
              {t(showPrompt ? "watch.hidePrompt" : "watch.showPrompt")}
            </button>
            {showPrompt && (
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-ground/70 p-3 font-mono text-xs leading-relaxed text-text">
                {prompt}
              </pre>
            )}
          </div>
        )}
      </div>

      {description && (
        <div className={clsx("mt-3 whitespace-pre-wrap break-words text-text", !open && long && "line-clamp-3")}>
          <RichText text={description} />
        </div>
      )}
      {open && (
        <div className="mt-4 space-y-1 text-xs text-muted">
          <div>
            {t("watch.category")}:{" "}
            <Link href={`/?c=${category}`} className="text-text hover:underline">
              {categoryLabel}
            </Link>
          </div>
          {tags.length > 0 && (
            <div>
              {t("watch.tags")}: {tags.join(", ")}
            </div>
          )}
        </div>
      )}
      <button className="mt-2 font-medium text-text hover:underline" onClick={() => setOpen((value) => !value)}>
        {t(open ? "watch.showLess" : "watch.showMore")}
      </button>
    </div>
  );
}

export function AutoplayToggle() {
  const { t } = useI18n();
  const [on, setOn] = useAutoplay();
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
      {t("watch.autoplay")}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setOn(!on)}
        className={clsx("relative h-5 w-9 rounded-full transition-colors", on ? "bg-brand" : "bg-line-bright")}
      >
        <span className={clsx("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", on ? "left-[18px]" : "left-0.5")} />
      </button>
    </label>
  );
}
