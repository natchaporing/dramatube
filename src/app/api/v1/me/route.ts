import { apiError, apiUser, requestOrigin } from "@/lib/api";
import { mediaUrl } from "@/lib/storage";

export async function GET(request: Request) {
  const user = await apiUser(request, false);
  if (!user) return apiError(401, "unauthenticated");
  const origin = requestOrigin(request);
  const avatar = mediaUrl(user.avatarKey);
  return Response.json({
    id: user.id,
    handle: user.handle,
    name: user.name,
    channelUrl: `${origin}/@${user.handle}`,
    avatarUrl: avatar ? (avatar.startsWith("http") ? avatar : `${origin}${avatar}`) : null,
    subscriberCount: user.subscriberCount,
  });
}
