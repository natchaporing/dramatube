/**
 * Where to go after signing in. Only a path on this site: `//evil.com` and
 * `https://…` would turn the sign-in form into an open redirect.
 */
export function safeNext(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
