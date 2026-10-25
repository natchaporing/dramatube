import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Next dev reloads modules on every edit; without the global cache each reload
 * opens a fresh pool and Postgres runs out of connections within a minute.
 */
const globalForDb = globalThis as unknown as { __dramatubeSql?: ReturnType<typeof postgres> };

export const sql = globalForDb.__dramatubeSql ?? postgres(env.databaseUrl, { max: 10, idle_timeout: 20 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__dramatubeSql = sql;
}

export const db = drizzle(sql, { schema });
export { schema };
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
