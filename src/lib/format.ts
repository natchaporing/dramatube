/**
 * Numbers and times the way a video site says them: "1.2K views", "3:07",
 * "2 days ago". Pure, so the server and the browser agree.
 */

export function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function timeAgo(date: Date | string, locale: string, now: Date = new Date()): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const elapsed = Math.max(0, (now.getTime() - then.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (elapsed >= size) return rtf.format(-Math.floor(elapsed / size), unit);
  }
  return rtf.format(0, "minute");
}

/**
 * Dates are days in Bangkok, where the audience is, whatever clock the server
 * runs on: a premiere set for the 20th is the 20th, not the 19th in UTC.
 */
export const SITE_TIME_ZONE = "Asia/Bangkok";

export function formatDate(date: Date | string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", timeZone: SITE_TIME_ZONE }).format(
    typeof date === "string" ? new Date(date) : date,
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** Vertical is anything taller than it is wide — 9:16 drama, phone footage. */
export function isVertical(width: number, height: number): boolean {
  return height > width && width > 0;
}
