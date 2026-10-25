"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Play, X } from "lucide-react";
import { useT } from "./i18n";

const noSubscription = () => () => {};

function readHidden(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * The series a viewer was last watching, kept at the bottom of the browse
 * pages until they pick it up or wave it away. Hidden for the rest of the
 * visit once closed — for that episode; the next one brings it back.
 */
export function ContinueBar({
  href,
  title,
  tally,
  art,
  progress,
  hideKey,
}: {
  href: string;
  title: string;
  /** "EP 3 / 40", already in the viewer's language. */
  tally: string;
  art: string | null;
  progress: number;
  hideKey: string;
}) {
  const t = useT();
  const key = `dt_continue_hidden:${hideKey}`;
  // Hidden on the server and until the browser has said otherwise, so it never flashes up and away.
  const hiddenEarlier = useSyncExternalStore(noSubscription, () => readHidden(key), () => true);
  const [closed, setClosed] = useState(false);
  if (hiddenEarlier || closed) return null;
  return (
    <div className="fixed inset-x-3 bottom-[4.5rem] z-30 mx-auto max-w-md md:bottom-5" data-testid="continue-bar">
      <div className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-line-bright bg-raised/95 p-2 pr-2 shadow-2xl backdrop-blur">
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
          <span className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-surface">
            {art && <img src={art} alt="" className="h-full w-full object-cover" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-text">{title}</span>
            <span className="block text-xs text-muted">{t("continue.label", { tally })}</span>
          </span>
        </Link>
        <Link href={href} className="btn btn-primary h-9 shrink-0 px-3 text-sm">
          <Play size={14} className="fill-white" /> {t("continue.play")}
        </Link>
        <button
          type="button"
          aria-label={t("continue.hide")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-text"
          onClick={() => {
            try {
              window.sessionStorage.setItem(key, "1");
            } catch {
              /* not remembered past this page; still closes */
            }
            setClosed(true);
          }}
        >
          <X size={16} />
        </button>
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10">
          <span className="block h-full bg-brand" style={{ width: `${Math.max(3, progress * 100)}%` }} />
        </span>
      </div>
    </div>
  );
}
