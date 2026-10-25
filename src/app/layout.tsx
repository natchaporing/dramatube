import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
import { I18nProvider } from "@/components/i18n";
import { dictionary } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { env } from "@/lib/env";
import "./globals.css";

/*
 * Inter for Latin, Noto Sans Thai chained behind it for the glyphs Inter does
 * not have — without it every Thai character renders as a box, including the
 * ones in the language switcher.
 */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const thai = Noto_Sans_Thai({
  subsets: ["thai"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-thai",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: env.publicAppUrl ? new URL(env.publicAppUrl) : undefined,
    title: { default: "DramaTube", template: "%s · DramaTube" },
    description: "A video platform for AI creators: films, series and music videos, each one saying which models made it.",
  };
}

export const viewport: Viewport = {
  themeColor: "#0e0e11",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${inter.variable} ${thai.variable}`}>
      <body className="min-h-screen bg-ground text-text antialiased">
        <I18nProvider locale={locale} messages={dictionary(locale)}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
