import { SignInWall } from "@/components/sign-in-wall";
import { UploadFlow } from "@/components/studio/upload-flow";
import { env } from "@/lib/env";
import { listOwnSeries } from "@/lib/studio";
import { pageContext } from "@/lib/viewer";

export const metadata = { title: "Upload" };

export default async function UploadPage() {
  const { user, t } = await pageContext();
  if (!user) return <SignInWall title={t("upload.signIn")} next="/upload" />;
  const seriesOptions = await listOwnSeries(user.id);
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold text-text">{t("upload.title")}</h1>
      <UploadFlow maxBytes={env.uploadMaxBytes} seriesOptions={seriesOptions} />
    </div>
  );
}
