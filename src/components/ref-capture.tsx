"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * A page opened from a creator's own link (`?ref=<handle>`) tells the server
 * once, so that creator's sales to this viewer count as direct for 30 days.
 */
export function RefCapture() {
  const params = useSearchParams();
  const ref = params.get("ref");
  useEffect(() => {
    if (!ref || !/^@?[A-Za-z0-9._-]{3,30}$/.test(ref)) return;
    const key = `dt_ref_sent:${ref.toLowerCase()}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* storage blocked: send it anyway; the server is idempotent */
    }
    void fetch("/api/ref", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: ref }) }).catch(() => {});
  }, [ref]);
  return null;
}
