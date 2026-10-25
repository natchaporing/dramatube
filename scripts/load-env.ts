/**
 * Imported first by every script, so `.env.local` (what `next dev` reads) is
 * loaded before any module that reads the environment is evaluated. A call
 * to `config()` in the script body would run too late: imports are hoisted.
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
