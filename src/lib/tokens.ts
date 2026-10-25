import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, users, type User } from "@/db/schema";
import { newId } from "./ids";

/**
 * Personal API tokens. The token is shown once, at creation; only its SHA-256
 * is stored, which is enough for a 190-bit random secret — there is nothing
 * to brute-force, so a slow hash would buy nothing but latency on every call.
 */
const PREFIX = "dtk_";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return PREFIX + randomBytes(24).toString("base64url");
}

export async function createToken(userId: string, name: string) {
  const token = generateToken();
  const [row] = await db
    .insert(apiTokens)
    .values({
      id: newId("tok"),
      userId,
      name: name.trim().slice(0, 60) || "API token",
      tokenHash: hashToken(token),
      prefix: token.slice(0, PREFIX.length + 6),
    })
    .returning();
  return { token, row };
}

export async function listTokens(userId: string) {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt));
}

export async function revokeToken(userId: string, tokenId: string) {
  await db.delete(apiTokens).where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)));
}

/** The user an `Authorization: Bearer dtk_…` header belongs to, or null. */
export async function userFromBearer(header: string | null): Promise<User | null> {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  if (!match || !match[1].startsWith(PREFIX)) return null;
  const [row] = await db
    .select({ user: users, tokenId: apiTokens.id, lastUsedAt: apiTokens.lastUsedAt })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(eq(apiTokens.tokenHash, hashToken(match[1])))
    .limit(1);
  if (!row) return null;
  // "Last used" to the nearest few minutes is all anybody reads it for.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 5 * 60 * 1000) {
    await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.tokenId));
  }
  return row.user;
}
