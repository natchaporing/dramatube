/**
 * Channel handles: what goes after the @.
 *
 * Lowercase letters, digits, dot, dash and underscore; 3–30 long; starting
 * with a letter or digit. Kept ASCII on purpose — a handle is typed into an
 * address bar and read aloud, and two scripts that look alike are how
 * impersonation works.
 */
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;
const HANDLE_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;

/** Routes that a handle must never shadow, if handles ever move to the root. */
const RESERVED = new Set([
  "admin", "api", "c", "embed", "feed", "login", "logout", "search", "series",
  "settings", "signup", "studio", "upload", "vertical", "watch", "dramatube", "support", "help",
]);

export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@/, "").toLowerCase();
}

export function handleProblem(handle: string): "length" | "characters" | "reserved" | null {
  if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX) return "length";
  if (!HANDLE_RE.test(handle)) return "characters";
  if (RESERVED.has(handle)) return "reserved";
  return null;
}

/** A starting handle from a name or an email, before uniqueness is checked. */
export function suggestHandle(source: string): string {
  const base = source
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split("@")[0]
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/^[._-]+/, "")
    .slice(0, 24);
  const padded = base.length >= HANDLE_MIN ? base : `${base}creator`.slice(0, 24);
  return RESERVED.has(padded) ? `${padded}-tv` : padded;
}
