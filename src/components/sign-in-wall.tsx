import Link from "next/link";
import { UserRound } from "lucide-react";
import { getT } from "@/lib/i18n/server";
import { EmptyState } from "./video-card";

export async function SignInWall({ title, next }: { title: string; next: string }) {
  const { t } = await getT();
  return (
    <EmptyState
      title={title}
      action={
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn border border-line text-[#8ab4ff] hover:bg-[#1a2433]">
          <UserRound size={18} /> {t("nav.signIn")}
        </Link>
      }
    />
  );
}
