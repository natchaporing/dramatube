import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth";
import { sameOrigin } from "@/lib/origin";
import { SESSION_COOKIE } from "@/lib/session";
import { deviceKey, takeOverStreams } from "@/lib/streams";

/** "Watch here instead": this browser takes the account's streams over from the others. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const user = await currentUser();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!user || !token) return new Response("Sign in", { status: 401 });
  await takeOverStreams(user.id, deviceKey(token));
  return new Response(null, { status: 204 });
}
