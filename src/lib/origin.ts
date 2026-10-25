/**
 * Whether a cookie-authenticated POST came from this site's own pages.
 * Browsers always send Origin on a cross-site POST, so a mismatch is a
 * forgery; a missing one is a non-browser client with no cookies to abuse.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
