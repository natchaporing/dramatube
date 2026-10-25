/**
 * Grant or take away the moderator role.
 *
 *   pnpm admin:grant you@example.com
 *   pnpm admin:revoke someone@example.com
 *   pnpm admin:list
 *
 * This is the only way to become an admin. It needs a shell on the server
 * and the database URL, which is the point: signing up proves nothing about
 * who owns an email address, so it cannot be how moderation is handed out.
 */
import "./load-env";
import { eq } from "drizzle-orm";
import { db, sql } from "../src/db";
import { users } from "../src/db/schema";

const [command, rawEmail] = process.argv.slice(2);

async function main() {
  if (command === "list") {
    const admins = await db.select({ email: users.email, handle: users.handle }).from(users).where(eq(users.role, "admin"));
    console.log(admins.length ? admins.map((a) => `${a.email}  @${a.handle}`).join("\n") : "no admins");
    return;
  }
  if ((command !== "grant" && command !== "revoke") || !rawEmail) {
    console.log("usage: pnpm admin:grant <email> | pnpm admin:revoke <email> | pnpm admin:list");
    process.exitCode = 1;
    return;
  }
  const email = rawEmail.trim().toLowerCase();
  const [user] = await db
    .update(users)
    .set({ role: command === "grant" ? "admin" : "member" })
    .where(eq(users.email, email))
    .returning({ handle: users.handle });
  if (!user) {
    console.log(`No account with the email ${email}. Sign up first, then run this again.`);
    process.exitCode = 1;
    return;
  }
  console.log(`${email} (@${user.handle}) is ${command === "grant" ? "now an admin" : "no longer an admin"}.`);
}

main().finally(() => sql.end());
