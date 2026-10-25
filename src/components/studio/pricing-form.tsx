"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { updatePricingAction, type MoneyFormState } from "@/app/actions/money";
import type { MessageKey } from "@/lib/i18n";
import {
  EPISODE_PRICES,
  SERIES_PERCENT_MAX,
  SERIES_PERCENT_MIN,
  FREE_EPISODES_MAX,
  FREE_EPISODES_MIN,
  creatorCredits,
  satangToBaht,
} from "@/lib/money";
import { useI18n } from "../i18n";
import { keepFields } from "./keep-fields";

export interface PricingValues {
  onSale: boolean;
  freeEpisodes: number;
  episodePrice: number;
  seriesPricePercent: number;
  /** ISO date the 90-day exclusive window ends, if inside it. */
  exclusiveUntil: string | null;
}

export function PricingForm({
  seriesId,
  initial,
  canSell,
  shareLink,
}: {
  seriesId: string;
  initial: PricingValues;
  canSell: boolean;
  shareLink: string;
}) {
  const { t, locale } = useI18n();
  const [state, action, pending] = useActionState<MoneyFormState, FormData>(updatePricingAction, null);
  const [price, setPrice] = useState(initial.episodePrice);
  const [exclusive, setExclusive] = useState(Boolean(initial.exclusiveUntil));
  const [copied, setCopied] = useState(false);
  const locked = Boolean(initial.exclusiveUntil);

  return (
    <form onSubmit={keepFields(action)} className="space-y-4 rounded-lg border border-line bg-surface p-4">
      <input type="hidden" name="seriesId" value={seriesId} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-text">{t("price.title")}</span>
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" name="onSale" defaultChecked={initial.onSale} disabled={!canSell} data-testid="on-sale" />
          {t("price.onSale")}
        </label>
      </div>
      {!canSell && (
        <p className="text-xs text-muted">
          {t("price.needSeller")}{" "}
          <Link href="/studio/earnings" className="font-medium text-[#8ab4ff] hover:underline">
            {t("price.verify")}
          </Link>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="label text-xs">{t("price.freeEpisodes")}</span>
          <input
            name="freeEpisodes"
            type="number"
            min={FREE_EPISODES_MIN}
            max={FREE_EPISODES_MAX}
            defaultValue={initial.freeEpisodes}
            className="field"
            data-testid="free-episodes"
          />
          <span className="hint block">{t("price.freeHint")}</span>
        </label>
        <label className="block">
          <span className="label text-xs">{t("price.episodePrice")}</span>
          <select name="episodePrice" value={price} onChange={(event) => setPrice(Number(event.target.value))} className="field">
            {EPISODE_PRICES.map((credits) => (
              <option key={credits} value={credits}>
                {t("price.creditsOption", { count: credits, baht: satangToBaht(Math.round((credits * 100) / 3)) })}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label text-xs">{t("price.seriesPercent")}</span>
          <div className="flex items-center gap-2">
            <input
              name="seriesPricePercent"
              type="number"
              min={SERIES_PERCENT_MIN}
              max={SERIES_PERCENT_MAX}
              step={5}
              defaultValue={initial.seriesPricePercent}
              className="field"
            />
            <span className="text-sm text-muted">%</span>
          </div>
          <span className="hint block">{t("price.seriesPercentHint")}</span>
        </label>
      </div>

      <label className="flex items-start gap-2 text-sm text-text">
        <input
          type="checkbox"
          name="exclusive"
          checked={exclusive}
          disabled={locked}
          onChange={(event) => setExclusive(event.target.checked)}
          className="mt-1"
        />
        <span>
          {t("price.exclusive")}
          {initial.exclusiveUntil && (
            <span className="block text-xs text-muted">
              {t("price.exclusiveUntil", { date: new Date(initial.exclusiveUntil).toLocaleDateString(locale) })}
            </span>
          )}
        </span>
      </label>
      {/* A disabled checkbox does not submit; keep the commitment while it runs. */}
      {locked && <input type="hidden" name="exclusive" value="on" />}

      <p className="rounded-md bg-raised px-3 py-2 text-xs text-muted">
        {t("price.earn", {
          direct: creatorCredits(price, "direct", exclusive),
          discovered: creatorCredits(price, "discovered", exclusive),
        })}
      </p>

      <div>
        <span className="label text-xs">{t("price.share")}</span>
        <div className="flex gap-2">
          <input readOnly value={shareLink} className="field font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
          <button
            type="button"
            className="btn btn-ghost shrink-0"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareLink);
                setCopied(true);
              } catch {
                /* the field is selectable */
              }
            }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {t(copied ? "earn.copied" : "earn.copy")}
          </button>
        </div>
      </div>

      {state?.error && (
        <p className="text-sm text-bad" role="alert">
          {t(`price.error.${state.error}` as MessageKey)}
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        {state?.ok && !pending && <span className="text-xs text-good">{t("price.saved")}</span>}
        <button className="btn btn-primary h-9" disabled={pending} data-testid="save-pricing">
          {t("price.save")}
        </button>
      </div>
    </form>
  );
}
