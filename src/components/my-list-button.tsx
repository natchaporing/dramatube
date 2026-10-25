"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BookmarkCheck, BookmarkPlus } from "lucide-react";
import clsx from "clsx";
import { setMyListAction } from "@/app/actions/dramas";
import { useT } from "./i18n";

/** Save a series for later. Answers at once and settles when the server does. */
export function MyListButton({ seriesId, saved: initial, signedIn, next }: { seriesId: string; saved: boolean; signedIn: boolean; next: string }) {
  const t = useT();
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  if (!signedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn btn-ghost" title={t("myList.signIn")}>
        <BookmarkPlus size={18} /> {t("myList.add")}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={clsx("btn", saved ? "btn-light" : "btn-ghost")}
      aria-pressed={saved}
      disabled={pending}
      data-testid="my-list-button"
      onClick={() => {
        const want = !saved;
        setSaved(want);
        start(async () => {
          const result = await setMyListAction(seriesId, want);
          if ("error" in result) setSaved(!want);
        });
      }}
    >
      {saved ? <BookmarkCheck size={18} /> : <BookmarkPlus size={18} />}
      {t(saved ? "myList.saved" : "myList.add")}
    </button>
  );
}
