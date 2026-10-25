import { SignInWall } from "@/components/sign-in-wall";
import { StudioTabs } from "@/components/studio/tabs";
import { pageContext } from "@/lib/viewer";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const { user, t } = await pageContext();
  if (!user) return <SignInWall title={t("upload.signIn")} next="/studio" />;
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">
      <StudioTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}
