import "server-only";
import { headers } from "next/headers";
import { env } from "./env";

/** This site's address as the visitor reached it, for links people will copy. */
export async function siteOrigin(): Promise<string> {
  if (env.publicAppUrl) return env.publicAppUrl;
  const head = await headers();
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? "localhost:3000";
  const proto = head.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
