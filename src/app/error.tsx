"use client";

import Link from "next/link";
import { useT } from "@/components/i18n";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-lg text-text">{t("common.error")}</p>
      <div className="flex gap-2">
        <button className="btn btn-ghost" onClick={reset}>
          {t("upload.retry")}
        </button>
        <Link href="/" className="btn btn-ghost">
          {t("common.goHome")}
        </Link>
      </div>
    </div>
  );
}
