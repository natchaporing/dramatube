"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useT } from "../i18n";

/** Polls a pending purchase and refreshes the page the moment it is paid, failed or expired. */
export function PayStatus({ purchaseId, expiresAt, label }: { purchaseId: string; expiresAt: string | null; label: string }) {
  const t = useT();
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/purchases/${purchaseId}`, { cache: "no-store" });
        const body = (await response.json()) as { status?: string };
        if (!stopped && body.status && body.status !== "pending") router.refresh();
      } catch {
        /* the next poll tries again */
      }
    };
    const timer = window.setInterval(poll, 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [purchaseId, router]);

  useEffect(() => {
    if (!expiresAt) return;
    const end = Date.parse(expiresAt);
    const tick = () => setLeft(Math.max(0, Math.round((end - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  return (
    <div className="space-y-1 text-center">
      <p className="flex items-center justify-center gap-2 text-sm text-muted">
        <LoaderCircle size={16} className="animate-spin" /> {label}
      </p>
      {left !== null && (
        <p className="font-mono text-xs text-faint">
          {t("pay.expiresIn", { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` })}
        </p>
      )}
    </div>
  );
}
