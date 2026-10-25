import Link from "next/link";
import { Logo } from "@/components/logo";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <Logo />
      <p className="text-lg text-muted">{t("common.notFound")}</p>
      <Link href="/" className="btn btn-ghost">
        {t("common.goHome")}
      </Link>
    </div>
  );
}
