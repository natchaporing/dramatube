"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useT } from "../i18n";

export function StudioTabs() {
  const t = useT();
  const pathname = usePathname();
  const tabs = [
    { href: "/studio", label: t("studio.content"), active: pathname === "/studio" || pathname.startsWith("/studio/videos") },
    { href: "/studio/series", label: t("studio.series"), active: pathname.startsWith("/studio/series") },
    { href: "/studio/channel", label: t("studio.channel"), active: pathname.startsWith("/studio/channel") },
    { href: "/studio/api", label: t("studio.api"), active: pathname.startsWith("/studio/api") },
  ];
  return (
    <nav className="no-scrollbar flex gap-6 overflow-x-auto border-b border-line">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={clsx(
            "-mb-px whitespace-nowrap border-b-2 pb-3 text-sm font-medium",
            tab.active ? "border-brand text-text" : "border-transparent text-muted hover:text-text",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
