import { SignJWT, jwtVerify } from "jose";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { env } from "./env";
import { newId } from "./ids";
import { hashPassword, verifyPassword } from "./password";
import { handleProblem, normalizeHandle, suggestHandle } from "./handles";

/**
 * Sessions and accounts, with no idea where the token came from. Reading the
 * cookie is `auth.ts`'s job; everything here takes values in and hands a user
 * back, so scripts and the API can use it too.
 */
export const SESSION_COOKIE = "dramatube_session";
const SESSION_DAYS = 30;

const secret = () => new TextEncoder().encode(env.authSecret);

export async function signSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function userById(id: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export async function userFromToken(token: string | null | undefined): Promise<User | null> {
  if (!token) return null;
  const userId = await verifySessionToken(token);
  return userId ? userById(userId) : null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  };
}

/**
 * The admin decision. ADMIN_EMAILS is authoritative when set — the role column
 * is written once at sign-up, so on an install where somebody else registered
 * first this is the only way to take moderation back. Unset, the role column
 * decides, and the first account to exist was given it.
 */
export function isAdmin(user: Pick<User, "email" | "role">): boolean {
  const named = env.adminEmails;
  return named.length > 0 ? named.includes(user.email.toLowerCase()) : user.role === "admin";
}

export class AccountError extends Error {
  constructor(public readonly code: "email_taken" | "handle_taken" | "handle_invalid" | "weak_password" | "bad_email") {
    super(code);
  }
}

async function freeHandle(wanted: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? wanted : `${wanted.slice(0, 26)}${attempt + 1}`;
    if (handleProblem(candidate)) continue;
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.handle, candidate)).limit(1);
    if (!taken) return candidate;
  }
  return `${wanted.slice(0, 20)}-${Date.now().toString(36)}`;
}

export async function registerUser(opts: { email: string; name: string; password: string; handle?: string }) {
  const email = opts.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new AccountError("bad_email");
  if (opts.password.length < 8) throw new AccountError("weak_password");

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw new AccountError("email_taken");

  let handle: string;
  if (opts.handle && opts.handle.trim()) {
    handle = normalizeHandle(opts.handle);
    if (handleProblem(handle)) throw new AccountError("handle_invalid");
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.handle, handle)).limit(1);
    if (taken) throw new AccountError("handle_taken");
  } else {
    handle = await freeHandle(suggestHandle(opts.name || email));
  }

  const [{ total }] = await db.select({ total: count() }).from(users);
  const named = env.adminEmails;
  const role = total === 0 || named.includes(email) ? "admin" : "member";

  const name = opts.name.trim().slice(0, 60) || email.split("@")[0];
  try {
    const [user] = await db
      .insert(users)
      .values({ id: newId("user"), email, name, handle, passwordHash: await hashPassword(opts.password), role })
      .returning();
    return user;
  } catch (error) {
    // Two sign-ups racing for one email or handle: the unique index decides.
    if ((error as { code?: string }).code === "23505") {
      throw new AccountError(String(error).includes("handle") ? "handle_taken" : "email_taken");
    }
    throw error;
  }
}

export async function authenticate(email: string, password: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  if (!user) {
    // Spend the same time as a real check, so timing does not say which
    // emails have accounts.
    await verifyPassword(password, "00000000000000000000000000000000:" + "0".repeat(128));
    return null;
  }
  return (await verifyPassword(password, user.passwordHash)) ? user : null;
}
