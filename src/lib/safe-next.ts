/**
 * Where to go after signing in: only a path on this site.
 *
 * Checked by parsing rather than by prefix. Browsers strip tabs and newlines
 * from URLs before reading them, so `/\t/evil.example` becomes
 * `//evil.example` — another site — even though it starts with one slash.
 * Resolving against a placeholder origin and requiring the result to stay
 * there catches that and every spelling like it.
 */
export function safeNext(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  try {
    const url = new URL(value, "http://placeholder.invalid");
    if (url.origin !== "http://placeholder.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
