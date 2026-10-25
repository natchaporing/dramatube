import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, isAdmin, sessionCookieOptions, signSessionToken, userFromToken } from "./session";

/**
 * The Next adapter for sessions: where the token lives on this host is a
 * cookie. Everything else about accounts is in `session.ts`.
 */
export async function createSession(userId: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, await signSessionToken(userId), sessionCookieOptions());
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function currentUser() {
  return userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdmin(user)) throw new Error("FORBIDDEN");
  return user;
}
