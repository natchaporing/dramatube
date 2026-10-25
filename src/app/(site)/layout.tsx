import { Shell } from "@/components/shell";
import { currentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/session";
import { mediaUrl } from "@/lib/storage";
import { subscribedChannels } from "@/lib/videos";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const subscriptions = user ? await subscribedChannels(user.id) : [];
  return (
    <Shell
      user={
        user
          ? { id: user.id, name: user.name, handle: user.handle, avatarUrl: mediaUrl(user.avatarKey), isAdmin: isAdmin(user) }
          : null
      }
      subscriptions={subscriptions}
    >
      {children}
    </Shell>
  );
}
