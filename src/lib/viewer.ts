import "server-only";
import { currentUser } from "./auth";
import { getT } from "./i18n/server";
import { isAdmin } from "./session";

/** What nearly every page starts with: who is looking, and in which language. */
export async function pageContext() {
  const [user, { t, locale }] = await Promise.all([currentUser(), getT()]);
  return { user, admin: user ? isAdmin(user) : false, t, locale, fmt: { t, locale } };
}
