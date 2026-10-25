import { ChannelForm } from "@/components/studio/channel-form";
import { mediaUrl } from "@/lib/storage";
import { pageContext } from "@/lib/viewer";

export const metadata = { title: "Customize channel" };

export default async function StudioChannelPage() {
  const { user, t } = await pageContext();
  if (!user) return null;
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text">{t("studio.channelTitle")}</h1>
      <ChannelForm
        name={user.name}
        handle={user.handle}
        bio={user.bio}
        avatarUrl={mediaUrl(user.avatarKey)}
        bannerUrl={mediaUrl(user.bannerKey)}
      />
    </div>
  );
}
