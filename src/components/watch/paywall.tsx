"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Coins, Lock, LoaderCircle } from "lucide-react";
import clsx from "clsx";
import { unlockEpisodeAction, unlockRestAction, type UnlockResult } from "@/app/actions/money";
import { isVertical } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "../i18n";

/**
 * In place of the player when an episode is for sale and the viewer has not
 * bought it. Two offers: this episode, or every remaining episode at the
 * series price. Not enough credits leads to the wallet and back here.
 */
export function Paywall({
  videoId,
  seriesId,
  episodeNumber,
  freeEpisodes,
  price,
  rest,
  balance,
  poster,
  width,
  height,
  here,
}: {
  videoId: string;
  seriesId: string;
  episodeNumber: number;
  freeEpisodes: number;
  price: number;
  rest: { count: number; total: number; fullPrice: number } | null;
  /** Null when signed out. */
  balance: number | null;
  poster: string | null;
  width: number;
  height: number;
  here: string;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<UnlockResult | null>(null);
  const tall = isVertical(width, height);

  const run = (action: () => Promise<UnlockResult>) =>
    start(async () => {
      const outcome = await action();
      setResult(outcome);
      if ("ok" in outcome || outcome.error === "not_locked") router.refresh();
    });

  const topUp = `/wallet?return=${encodeURIComponent(here)}`;
  const showRest = rest && rest.count > 1;
  const savePercent = showRest ? Math.round(100 - (rest.total / rest.fullPrice) * 100) : 0;
  const needed = result && "error" in result && result.error === "insufficient" ? result.needed - result.balance : 0;

  return (
    <div
      className={clsx("relative overflow-hidden bg-black sm:rounded-xl", tall ? "mx-auto aspect-[9/16] max-h-[78vh]" : "aspect-video")}
      data-testid="paywall"
    >
      {poster && <img src={poster} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl" />}
      <div className="relative flex h-full flex-col items-center justify-center gap-3 overflow-y-auto p-5 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-warn">
          <Lock size={22} />
        </span>
        <h2 className="text-lg font-bold text-white sm:text-xl">{t("paywall.locked", { number: episodeNumber })}</h2>
        <p className="text-sm text-white/70">{t("paywall.free", { count: freeEpisodes })}</p>

        {balance === null ? (
          <Link href={`/login?next=${encodeURIComponent(here)}`} className="btn btn-primary mt-2">
            {t("paywall.signIn")}
          </Link>
        ) : (
          <div className="mt-2 flex w-full max-w-sm flex-col gap-2">
            <button className="btn btn-primary py-2.5" disabled={pending} onClick={() => run(() => unlockEpisodeAction(videoId))} data-testid="unlock-episode">
              {pending ? <LoaderCircle size={16} className="animate-spin" /> : <Coins size={16} />}
              {t("paywall.unlock", { price })}
            </button>
            {showRest && (
              <button className="btn btn-light py-2.5" disabled={pending} onClick={() => run(() => unlockRestAction(seriesId, videoId))} data-testid="unlock-rest">
                {t("paywall.unlockRest", { count: rest.count, price: rest.total })}
                {savePercent > 0 && <span className="rounded bg-brand px-1.5 py-0.5 text-[11px] font-semibold text-white">{t("paywall.save", { percent: savePercent })}</span>}
              </button>
            )}
            <p className="text-xs text-white/70">
              {t("paywall.balance", { balance: (result && "error" in result && result.error === "insufficient" ? result.balance : balance).toLocaleString() })}{" "}
              <Link href={topUp} className="font-medium text-warn hover:underline">
                {t("paywall.topUp")}
              </Link>
            </p>
            {needed > 0 && (
              <p className="rounded-md bg-bad-dim px-3 py-2 text-sm text-bad" role="alert">
                {t("paywall.notEnough", { needed })}{" "}
                <Link href={topUp} className="font-semibold underline">
                  {t("paywall.topUp")}
                </Link>
              </p>
            )}
            {result && "error" in result && result.error !== "insufficient" && result.error !== "signin" && (
              <p className="text-sm text-bad" role="alert">
                {t(`paywall.error.${result.error}` as MessageKey)}
              </p>
            )}
            <p className="text-[11px] text-white/50">{t("paywall.keep")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
