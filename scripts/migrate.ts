import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/dramatube";
const sql = postgres(url, { max: 1, onnotice: () => {} });

await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
await sql.end();
console.log("migrations applied");
