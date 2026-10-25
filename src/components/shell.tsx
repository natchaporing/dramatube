"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import {
  ArrowLeft,
  Clapperboard,
  House,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  RotateCcwClock,
  Search,
  Shield,
  Smartphone,
  SquarePlus,
  ThumbsUp,
  UserRound,
  Users,
} from "lucide-react";
import { Avatar } from "./avatar";
import { Logo } from "./logo";
import { useI18n } from "./i18n";
import { LOCALES, LOCALE_NAMES, type MessageKey } from "@/lib/i18n";
import { setLanguageAction, signOutAction } from "@/app/actions/auth";
import type { ChannelRef } from "@/lib/videos";

export interface ShellUser {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  isAdmin: boolean;
}

const EXPLORE: Array<{ category: string; key: MessageKey }> = [
  { category: "drama", key: "category.drama" },
  { category: "short-film", key: "category.short-film" },
  { category: "music-video", key: "category.music-video" },
  { category: "animation", key: "category.animation" },
  { category: "sci-fi", key: "category.sci-fi" },
  { category: "horror", key: "category.horror" },
  { category: "comedy", key: "category.comedy" },
];

/** Close a popover on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && close();
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

export function Shell({
  user,
  subscriptions,
  children,
}: {
  user: ShellUser | null;
  subscriptions: ChannelRef[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // The watch and vertical pages give the picture the whole width; the
  // sidebar is a drawer there, as on every video site.
  const immersive = pathname.startsWith("/watch") || pathname.startsWith("/vertical");
  const [expanded, setExpanded] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [searching, setSearching] = useState(false);

  // Navigating closes the drawer and the phone search bar. Adjusting state
  // while rendering, keyed on the path, rather than in an effect after it.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setDrawer(false);
    setSearching(false);
  }

  const toggleMenu = () => {
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    if (wide && !immersive) setExpanded((value) => !value);
    else setDrawer((value) => !value);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 bg-ground/95 px-2 backdrop-blur sm:px-4">
        {searching ? (
          <div className="flex flex-1 items-center gap-2 md:hidden">
            <button className="btn btn-quiet h-10 w-10 p-0" onClick={() => setSearching(false)} aria-label="Back">
              <ArrowLeft size={20} />
            </button>
            <Suspense fallback={null}>
              <SearchBox autoFocus />
            </Suspense>
          </div>
        ) : null}
        <div className={clsx("flex items-center gap-1", searching && "hidden md:flex")}>
          <MenuButton onClick={toggleMenu} />
          <Link href="/" className="px-1.5 py-1" aria-label="DramaTube">
            <Logo />
          </Link>
        </div>
        <div className="mx-auto hidden max-w-xl flex-1 md:flex">
          <Suspense fallback={null}>
            <SearchBox />
          </Suspense>
        </div>
        <div className={clsx("ml-auto flex items-center gap-1 sm:gap-2", searching && "hidden md:flex")}>
          <SearchIconButton onClick={() => setSearching(true)} />
          <UploadButton />
          <LanguageMenu />
          {user ? <UserMenu user={user} /> : <SignInButton />}
        </div>
      </header>

      <div className="flex">
        {!immersive && (
          <aside
            className={clsx(
              "sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 overflow-y-auto md:block",
              expanded ? "lg:w-60" : "lg:w-[76px]",
              "md:w-[76px]",
            )}
          >
            <div className={clsx("hidden", expanded ? "lg:block" : "")}>
              <SidebarFull user={user} subscriptions={subscriptions} pathname={pathname} />
            </div>
            <div className={clsx(expanded ? "lg:hidden" : "")}>
              <SidebarMini user={user} pathname={pathname} />
            </div>
          </aside>
        )}
        <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50">
          <button className="absolute inset-0 bg-black/60" aria-label="Close" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-ground shadow-2xl">
            <div className="flex h-14 items-center gap-1 px-2 sm:px-4">
              <MenuButton onClick={() => setDrawer(false)} />
              <Link href="/" className="px-1.5 py-1">
                <Logo />
              </Link>
            </div>
            <SidebarFull user={user} subscriptions={subscriptions} pathname={pathname} />
          </div>
        </div>
      )}

      <BottomNav user={user} pathname={pathname} />
    </div>
  );
}

function MenuButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button className="btn btn-quiet h-10 w-10 p-0" onClick={onClick} aria-label={t("nav.menu")}>
      <Menu size={20} />
    </button>
  );
}

function SearchIconButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button className="btn btn-quiet h-10 w-10 p-0 md:hidden" onClick={onClick} aria-label={t("nav.search")}>
      <Search size={20} />
    </button>
  );
}

function SearchBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const { t } = useI18n();
  const params = useSearchParams();
  const pathname = usePathname();
  const current = pathname === "/search" ? params.get("q") ?? "" : "";
  return (
    <form action="/search" className="flex w-full" role="search" key={current}>
      <input
        name="q"
        defaultValue={current}
        autoFocus={autoFocus}
        placeholder={t("nav.searchPlaceholder")}
        aria-label={t("nav.search")}
        className="h-10 min-w-0 flex-1 rounded-l-full border border-line bg-surface px-4 text-sm text-text placeholder:text-faint focus:border-line-bright focus:outline-none"
      />
      <button
        type="submit"
        className="flex h-10 w-14 items-center justify-center rounded-r-full border border-l-0 border-line bg-raised text-muted hover:bg-hover hover:text-text"
        aria-label={t("nav.search")}
      >
        <Search size={18} />
      </button>
    </form>
  );
}

function UploadButton() {
  const { t } = useI18n();
  return (
    <Link href="/upload" className="btn btn-ghost h-10 px-3" aria-label={t("nav.upload")}>
      <SquarePlus size={18} />
      <span className="hidden sm:inline">{t("nav.upload")}</span>
    </Link>
  );
}

function LanguageMenu() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button
        className="btn btn-quiet h-10 w-10 p-0"
        onClick={() => setOpen((value) => !value)}
        aria-label={t("nav.language")}
        aria-expanded={open}
        disabled={pending}
      >
        <Languages size={19} />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-40 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-2xl">
          {LOCALES.map((code) => (
            <button
              key={code}
              className={clsx(
                "flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-raised",
                code === locale ? "text-text" : "text-muted",
              )}
              onClick={() =>
                start(async () => {
                  await setLanguageAction(code);
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {LOCALE_NAMES[code]}
              {code === locale && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SignInButton() {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <Link
      href={`/login?next=${encodeURIComponent(pathname)}`}
      className="btn h-10 border border-line px-3 text-[#8ab4ff] hover:bg-[#1a2433]"
    >
      <UserRound size={18} />
      <span className="hidden sm:inline">{t("nav.signIn")}</span>
    </Link>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const item = "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-text hover:bg-raised";
  return (
    <div className="relative" ref={ref}>
      <button
        className="ml-1 rounded-full"
        onClick={() => setOpen((value) => !value)}
        aria-label={user.name}
        aria-expanded={open}
      >
        <Avatar name={user.name} handle={user.handle} url={user.avatarUrl} size={32} />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-lg border border-line bg-surface py-2 shadow-2xl">
          <div className="flex items-center gap-3 border-b border-line px-4 pb-3 pt-1">
            <Avatar name={user.name} handle={user.handle} url={user.avatarUrl} size={40} />
            <div className="min-w-0">
              <div className="truncate font-medium text-text">{user.name}</div>
              <div className="truncate text-sm text-muted">@{user.handle}</div>
            </div>
          </div>
          <div className="py-1" onClick={() => setOpen(false)}>
            <Link href={`/@${user.handle}`} className={item}>
              <UserRound size={18} /> {t("nav.yourChannel")}
            </Link>
            <Link href="/studio" className={item}>
              <LayoutDashboard size={18} /> {t("nav.studio")}
            </Link>
            {user.isAdmin && (
              <Link href="/admin" className={item}>
                <Shield size={18} /> {t("nav.admin")}
              </Link>
            )}
          </div>
          <form action={signOutAction} className="border-t border-line pt-1">
            <button className={item}>
              <LogOut size={18} /> {t("nav.signOut")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function NavLink({
  href,
  icon,
  label,
  active,
  mini = false,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  mini?: boolean;
}) {
  if (mini) {
    return (
      <Link
        href={href}
        className={clsx(
          "flex flex-col items-center gap-1.5 rounded-lg px-1 py-4 text-[10px] leading-tight",
          active ? "text-text" : "text-muted hover:bg-raised hover:text-text",
        )}
      >
        {icon}
        <span className="w-full truncate text-center">{label}</span>
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className={clsx(
        "flex items-center gap-5 rounded-lg px-3 py-2 text-sm",
        active ? "bg-raised font-medium text-text" : "text-text/90 hover:bg-raised",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}

function SidebarFull({
  user,
  subscriptions,
  pathname,
}: {
  user: ShellUser | null;
  subscriptions: ChannelRef[];
  pathname: string;
}) {
  const { t } = useI18n();
  const section = "border-t border-line px-3 py-3";
  return (
    <nav className="pb-6 text-sm">
      <div className="px-3 pb-3">
        <NavLink href="/" icon={<House size={20} />} label={t("nav.home")} active={pathname === "/"} />
        <NavLink href="/vertical" icon={<Smartphone size={20} />} label={t("nav.vertical")} active={pathname.startsWith("/vertical")} />
        <NavLink
          href="/feed/subscriptions"
          icon={<Users size={20} />}
          label={t("nav.subscriptions")}
          active={pathname === "/feed/subscriptions"}
        />
      </div>
      <div className={section}>
        <Link href="/feed/you" className="mb-1 block rounded-lg px-3 py-1.5 font-semibold text-text hover:bg-raised">
          {t("nav.you")} ›
        </Link>
        {user && (
          <NavLink
            href={`/@${user.handle}`}
            icon={<UserRound size={20} />}
            label={t("nav.yourChannel")}
            active={pathname === `/c/${user.handle}`}
          />
        )}
        <NavLink href="/feed/history" icon={<RotateCcwClock size={20} />} label={t("nav.history")} active={pathname === "/feed/history"} />
        <NavLink href="/feed/liked" icon={<ThumbsUp size={20} />} label={t("nav.liked")} active={pathname === "/feed/liked"} />
        {user && (
          <NavLink href="/studio" icon={<LayoutDashboard size={20} />} label={t("nav.studio")} active={pathname.startsWith("/studio")} />
        )}
        {user?.isAdmin && (
          <NavLink href="/admin" icon={<Shield size={20} />} label={t("nav.admin")} active={pathname.startsWith("/admin")} />
        )}
      </div>
      {user ? (
        subscriptions.length > 0 && (
          <div className={section}>
            <div className="px-3 pb-1 font-semibold text-text">{t("nav.subscriptions")}</div>
            {subscriptions.slice(0, 12).map((channel) => (
              <Link
                key={channel.id}
                href={`/@${channel.handle}`}
                className="flex items-center gap-4 rounded-lg px-3 py-1.5 text-text/90 hover:bg-raised"
              >
                <Avatar name={channel.name} handle={channel.handle} url={channel.avatarUrl} size={24} />
                <span className="truncate">{channel.name}</span>
              </Link>
            ))}
          </div>
        )
      ) : (
        <div className={clsx(section, "px-6")}>
          <p className="mb-3 text-muted">{t("nav.signInPrompt")}</p>
          <SignInButton />
        </div>
      )}
      <div className={section}>
        <div className="px-3 pb-1 font-semibold text-text">{t("nav.explore")}</div>
        {EXPLORE.map((entry) => (
          <NavLink
            key={entry.category}
            href={`/?c=${entry.category}`}
            icon={<Clapperboard size={20} />}
            label={t(entry.key)}
            active={false}
          />
        ))}
      </div>
      <p className="border-t border-line px-6 pt-4 text-xs leading-relaxed text-faint">{t("nav.footer")}</p>
    </nav>
  );
}

function SidebarMini({ user, pathname }: { user: ShellUser | null; pathname: string }) {
  const { t } = useI18n();
  return (
    <nav className="px-1 pt-1">
      <NavLink mini href="/" icon={<House size={22} />} label={t("nav.home")} active={pathname === "/"} />
      <NavLink mini href="/vertical" icon={<Smartphone size={22} />} label={t("nav.vertical")} active={pathname.startsWith("/vertical")} />
      <NavLink
        mini
        href="/feed/subscriptions"
        icon={<Users size={22} />}
        label={t("nav.subscriptions")}
        active={pathname === "/feed/subscriptions"}
      />
      <NavLink mini href="/feed/you" icon={<UserRound size={22} />} label={t("nav.you")} active={pathname === "/feed/you"} />
      {user && (
        <NavLink mini href="/studio" icon={<LayoutDashboard size={22} />} label={t("nav.studio")} active={pathname.startsWith("/studio")} />
      )}
    </nav>
  );
}

/** Phones get the five destinations at the thumb, as every video app does. */
function BottomNav({ user, pathname }: { user: ShellUser | null; pathname: string }) {
  const { t } = useI18n();
  if (pathname.startsWith("/vertical")) return null;
  const cell = (active: boolean) =>
    clsx("flex flex-1 flex-col items-center gap-1 py-2 text-[10px]", active ? "text-text" : "text-muted");
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-ground/95 backdrop-blur md:hidden">
      <Link href="/" className={cell(pathname === "/")}>
        <House size={22} />
        {t("nav.home")}
      </Link>
      <Link href="/vertical" className={cell(false)}>
        <Smartphone size={22} />
        {t("nav.vertical")}
      </Link>
      <Link href="/upload" className={cell(pathname === "/upload")} aria-label={t("nav.upload")}>
        <span className="flex h-8 w-11 items-center justify-center rounded-full bg-raised">
          <SquarePlus size={20} />
        </span>
      </Link>
      <Link href="/feed/subscriptions" className={cell(pathname === "/feed/subscriptions")}>
        <Users size={22} />
        {t("nav.subscriptions")}
      </Link>
      <Link href={user ? "/feed/you" : "/login"} className={cell(pathname === "/feed/you")}>
        {user ? <Avatar name={user.name} handle={user.handle} url={user.avatarUrl} size={22} /> : <UserRound size={22} />}
        {t("nav.you")}
      </Link>
    </nav>
  );
}

