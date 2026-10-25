"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import clsx from "clsx";
import { BellRing, Check, Code, Copy, Flag, Share2, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { reactAction, reportAction, subscribeAction } from "@/app/actions/social";
import { REPORT_REASONS } from "@/lib/catalog";
import { formatCount } from "@/lib/format";
import { useI18n } from "../i18n";

function useSignIn() {
  const router = useRouter();
  const pathname = usePathname();
  return () => router.push(`/login?next=${encodeURIComponent(pathname)}`);
}

export function SubscribeButton({
  channelId,
  initial,
  initialCount,
  signedIn,
  own,
  showCount = false,
}: {
  channelId: string;
  initial: boolean;
  initialCount: number;
  signedIn: boolean;
  own: boolean;
  showCount?: boolean;
}) {
  const { t, locale } = useI18n();
  const signIn = useSignIn();
  const [subscribed, setSubscribed] = useState(initial);
  const [count, setCount] = useState(initialCount);
  const [pending, start] = useTransition();
  if (own) return null;

  const toggle = () => {
    if (!signedIn) return signIn();
    const wanted = !subscribed;
    setSubscribed(wanted);
    setCount((value) => Math.max(0, value + (wanted ? 1 : -1)));
    start(async () => {
      const result = await subscribeAction(channelId, wanted);
      if ("subscriberCount" in result) {
        setSubscribed(result.subscribed);
        setCount(result.subscriberCount);
      } else {
        setSubscribed(!wanted);
      }
    });
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={toggle}
        disabled={pending}
        className={clsx("btn h-9", subscribed ? "btn-ghost" : "btn-light")}
        aria-pressed={subscribed}
      >
        {subscribed && <BellRing size={16} />}
        {t(subscribed ? "watch.subscribed" : "watch.subscribe")}
      </button>
      {showCount && (
        <span className="text-sm text-muted">
          {count === 1 ? t("watch.oneSubscriber") : t("watch.subscribers", { count: formatCount(count, locale) })}
        </span>
      )}
    </div>
  );
}

export function Reactions({
  videoId,
  initial,
  likes,
  signedIn,
  variant = "pill",
}: {
  videoId: string;
  initial: -1 | 0 | 1;
  likes: number;
  signedIn: boolean;
  variant?: "pill" | "rail";
}) {
  const { t, locale } = useI18n();
  const signIn = useSignIn();
  const [value, setValue] = useState(initial);
  const [likeCount, setLikeCount] = useState(likes);
  const [pending, start] = useTransition();

  const press = (pressed: 1 | -1) => {
    if (!signedIn) return signIn();
    const before = value;
    const after = before === pressed ? 0 : pressed;
    setValue(after);
    setLikeCount((count) => Math.max(0, count + (after === 1 ? 1 : 0) - (before === 1 ? 1 : 0)));
    start(async () => {
      const result = await reactAction(videoId, pressed);
      if ("likeCount" in result) {
        setValue(result.value);
        setLikeCount(result.likeCount);
      } else {
        setValue(before);
      }
    });
  };

  if (variant === "rail") {
    const round = "flex h-12 w-12 items-center justify-center rounded-full bg-raised text-white hover:bg-hover";
    return (
      <>
        <button onClick={() => press(1)} disabled={pending} aria-pressed={value === 1} aria-label={t("watch.like")} className="flex flex-col items-center gap-1 text-xs text-white">
          <span className={round}>
            <ThumbsUp size={20} className={value === 1 ? "fill-white" : ""} />
          </span>
          {formatCount(likeCount, locale)}
        </button>
        <button onClick={() => press(-1)} disabled={pending} aria-pressed={value === -1} aria-label={t("watch.dislike")} className="flex flex-col items-center gap-1 text-xs text-white">
          <span className={round}>
            <ThumbsDown size={20} className={value === -1 ? "fill-white" : ""} />
          </span>
          {t("watch.dislike")}
        </button>
      </>
    );
  }

  return (
    <div className="flex h-9 items-center overflow-hidden rounded-full bg-raised">
      <button
        onClick={() => press(1)}
        disabled={pending}
        aria-pressed={value === 1}
        aria-label={t("watch.like")}
        className="flex h-full items-center gap-2 pl-4 pr-3 text-sm font-medium hover:bg-hover"
      >
        <ThumbsUp size={18} className={value === 1 ? "fill-text" : ""} />
        {likeCount > 0 && formatCount(likeCount, locale)}
      </button>
      <span className="h-6 w-px bg-line-bright" />
      <button
        onClick={() => press(-1)}
        disabled={pending}
        aria-pressed={value === -1}
        aria-label={t("watch.dislike")}
        className="flex h-full items-center px-3 hover:bg-hover"
      >
        <ThumbsDown size={18} className={value === -1 ? "fill-text" : ""} />
      </button>
    </div>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-lg rounded-t-2xl border border-line bg-surface p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          <button className="btn btn-quiet h-9 w-9 p-0" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CopyField({ value, label }: { value: string; label: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="flex gap-2">
        <input readOnly value={value} className="field font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
        <button
          type="button"
          className="btn btn-light shrink-0"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard refused: the field is selectable */
            }
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? t("watch.copied") : t("watch.copyLink")}
        </button>
      </div>
    </label>
  );
}

export function ShareButton({
  videoId,
  embeddable,
  refHandle,
}: {
  videoId: string;
  embeddable: boolean;
  /** The creator sharing their own video: their link carries their tag, so its sales are direct. */
  refHandle?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [startAt, setStartAt] = useState<number | null>(null);

  const openDialog = () => {
    setOrigin(window.location.origin);
    const video = document.querySelector("video");
    setStartAt(video && video.currentTime > 1 ? Math.floor(video.currentTime) : null);
    setOpen(true);
  };
  const [useStart, setUseStart] = useState(false);
  const query = new URLSearchParams();
  if (refHandle) query.set("ref", refHandle);
  if (useStart && startAt) query.set("t", String(startAt));
  const link = `${origin}/watch/${videoId}${query.size ? `?${query.toString()}` : ""}`;
  const embed = `<iframe width="560" height="315" src="${origin}/embed/${videoId}" title="DramaTube video player" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;

  return (
    <>
      <button className="btn btn-ghost h-9" onClick={openDialog}>
        <Share2 size={17} /> {t("watch.share")}
      </button>
      {open && (
        <Dialog title={t("share.title")} onClose={() => setOpen(false)}>
          <div className="space-y-4">
            <CopyField value={link} label={refHandle ? t("earn.shareTitle") : t("share.link")} />
            {refHandle && <p className="text-xs text-muted">{t("earn.shareHint")}</p>}
            {startAt !== null && (
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={useStart} onChange={(event) => setUseStart(event.target.checked)} />
                {t("share.startAt")}
              </label>
            )}
            {embeddable && (
              <div>
                <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-text">
                  <Code size={16} /> {t("share.embedCode")}
                </div>
                <textarea readOnly value={embed} rows={3} className="field font-mono text-xs" onFocus={(event) => event.currentTarget.select()} />
              </div>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}

export function ReportButton({ videoId, signedIn }: { videoId: string; signedIn: boolean }) {
  const { t } = useI18n();
  const signIn = useSignIn();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  return (
    <>
      <button className="btn btn-ghost h-9" onClick={() => (signedIn ? setOpen(true) : signIn())}>
        <Flag size={17} /> <span className="hidden sm:inline">{t("watch.report")}</span>
      </button>
      {open && (
        <Dialog title={t("report.title")} onClose={() => setOpen(false)}>
          {done ? (
            <p className="py-4 text-muted">{t("report.thanks")}</p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                start(async () => {
                  const result = await reportAction(videoId, reason, details);
                  if ("ok" in result) setDone(true);
                });
              }}
              className="space-y-4"
            >
              <fieldset>
                <legend className="label">{t("report.reason")}</legend>
                <div className="space-y-1">
                  {REPORT_REASONS.map((value) => (
                    <label key={value} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-raised">
                      <input type="radio" name="reason" value={value} checked={reason === value} onChange={() => setReason(value)} />
                      {t(`report.reason.${value}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <span className="label">{t("report.details")}</span>
                <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={1000} rows={3} className="field" />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn btn-quiet" onClick={() => setOpen(false)}>
                  {t("common.cancel")}
                </button>
                <button className="btn btn-primary" disabled={!reason || pending}>
                  {t("report.submit")}
                </button>
              </div>
            </form>
          )}
        </Dialog>
      )}
    </>
  );
}

export function EditLink({ videoId }: { videoId: string }) {
  const { t } = useI18n();
  return (
    <Link href={`/studio/videos/${videoId}`} className="btn btn-ghost h-9">
      {t("watch.editVideo")}
    </Link>
  );
}
