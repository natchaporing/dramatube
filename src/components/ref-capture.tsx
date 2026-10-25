"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * A page opened from a creator's own link (`?ref=<handle>`) tells the server
 * once, so that creator's sales to this viewer count as direct for 30 days.
 *
 * Only a link from outside DramaTube counts: the page the viewer landed on
 * must carry the `ref`, and must not have been reached from a DramaTube page.
 * Otherwise a creator could put `?ref=` links in their descriptions and turn
 * viewers DramaTube found for them into "their own" at the higher share.
 */
function arrivedFromOutside(ref: string): boolean {
  const landing = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  let landed: URL;
  try {
    landed = new URL(landing?.name ?? window.location.href);
  } catch {
    return false;
  }
  if (landed.searchParams.get("ref") !== ref) return false;
  if (!document.referrer) return true;
  try {
    return new URL(document.referrer).origin !== window.location.origin;
  } catch {
    return true;
  }
}

export function RefCapture() {
  const params = useSearchParams();
  const ref = params.get("ref");
  useEffect(() => {
    if (!ref || !/^@?[A-Za-z0-9._-]{3,30}$/.test(ref) || !arrivedFromOutside(ref)) return;
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
