import { Suspense } from "react";
import { RefCapture } from "@/components/ref-capture";
import { Shell } from "@/components/shell";
import { currentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/session";
import { mediaUrl } from "@/lib/storage";
import { subscribedChannels } from "@/lib/videos";
import { balanceOf } from "@/lib/wallet";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const [subscriptions, balance] = user
    ? await Promise.all([subscribedChannels(user.id), balanceOf(user.id)])
    : [[], null];
  return (
    <Shell
      user={
        user
          ? { id: user.id, name: user.name, handle: user.handle, avatarUrl: mediaUrl(user.avatarKey), isAdmin: isAdmin(user) }
          : null
      }
      subscriptions={subscriptions}
      credits={balance ? balance.total : null}
    >
      <Suspense fallback={null}>
        <RefCapture />
      </Suspense>
      {children}
    </Shell>
  );
}
