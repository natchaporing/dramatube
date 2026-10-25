import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { currentUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { safeNext } from "@/lib/safe-next";
import { AuthForm } from "./auth-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await currentUser()) redirect(next);
  const { t } = await getT();
  const mode = params.mode === "signup" ? "signup" : "signin";

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="relative hidden flex-1 overflow-hidden lg:block">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 30% 30%, color-mix(in srgb, #ff4f6d 45%, transparent), transparent), radial-gradient(50% 60% at 70% 70%, color-mix(in srgb, #9b7bff 45%, transparent), transparent), #0e0e11",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/">
            <Logo />
          </Link>
          <div className="max-w-md">
            <h2 className="text-4xl font-bold leading-tight text-text">{t("brand.tagline")}</h2>
            <p className="mt-4 text-lg text-muted">{t("auth.pitch")}</p>
          </div>
          <p className="text-sm text-faint">{t("nav.footer")}</p>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 inline-block lg:hidden">
            <Logo />
          </Link>
          <h1 className="mb-6 text-2xl font-bold text-text">{t(mode === "signup" ? "auth.signUpTitle" : "auth.signInTitle")}</h1>
          <AuthForm mode={mode} next={next} />
          <p className="mt-6 text-sm text-muted">
            <Link
              href={`/login?${new URLSearchParams({ ...(mode === "signin" ? { mode: "signup" } : {}), next }).toString()}`}
              className="font-medium text-[#8ab4ff] hover:underline"
            >
              {t(mode === "signup" ? "auth.toSignIn" : "auth.toSignUp")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
