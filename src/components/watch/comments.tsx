"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { commentAction, deleteCommentAction, type CommentState } from "@/app/actions/social";
import { LIMITS } from "@/lib/catalog";
import { Avatar } from "../avatar";
import { useI18n } from "../i18n";
import { RichText } from "./rich-text";

export interface CommentItem {
  id: string;
  body: string;
  ago: string;
  author: { id: string; handle: string; name: string; avatarUrl: string | null };
  replies: CommentItem[];
}

interface Me {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
}

function CommentForm({
  videoId,
  parentId,
  me,
  autoFocus,
  onDone,
}: {
  videoId: string;
  parentId?: string;
  me: Me;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<CommentState, FormData>(commentAction, null);
  const [body, setBody] = useState("");
  const [focused, setFocused] = useState(Boolean(autoFocus));
  const handled = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state?.ok && state.ok !== handled.current) {
      handled.current = state.ok;
      setBody("");
      setFocused(false);
      onDone?.();
    }
  }, [state, onDone]);

  return (
    <form action={action} className="flex gap-3">
      <Avatar name={me.name} handle={me.handle} url={me.avatarUrl} size={parentId ? 28 : 40} />
      <div className="min-w-0 flex-1">
        <input type="hidden" name="videoId" value={videoId} />
        {parentId && <input type="hidden" name="parentId" value={parentId} />}
        <textarea
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onFocus={() => setFocused(true)}
          autoFocus={autoFocus}
          rows={focused ? 2 : 1}
          maxLength={LIMITS.comment}
          placeholder={t(parentId ? "comments.replyPlaceholder" : "comments.placeholder")}
          className="w-full resize-none border-b border-line bg-transparent pb-1 text-sm text-text placeholder:text-faint focus:border-text focus:outline-none"
        />
        {state?.error === "too_long" && <p className="text-xs text-bad">{t("comments.tooLong", { max: LIMITS.comment })}</p>}
        {focused && (
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-quiet h-9"
              onClick={() => {
                setBody("");
                setFocused(false);
                onDone?.();
              }}
            >
              {t("comments.cancel")}
            </button>
            <button className="btn btn-primary h-9" disabled={!body.trim() || pending}>
              {t(parentId ? "comments.reply" : "comments.post")}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

function Comment({
  comment,
  videoId,
  ownerId,
  me,
  canModerate,
  isReply = false,
}: {
  comment: CommentItem;
  videoId: string;
  ownerId: string;
  me: Me | null;
  canModerate: boolean;
  isReply?: boolean;
}) {
  const { t } = useI18n();
  const [replying, setReplying] = useState(false);
  const [pending, start] = useTransition();
  const canDelete = me && (me.id === comment.author.id || me.id === ownerId || canModerate);

  return (
    <div className={pending ? "opacity-50" : ""}>
      <div className="flex gap-3">
        <Link href={`/@${comment.author.handle}`} className="shrink-0">
          <Avatar name={comment.author.name} handle={comment.author.handle} url={comment.author.avatarUrl} size={isReply ? 28 : 40} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href={`/@${comment.author.handle}`}
              className={
                comment.author.id === ownerId
                  ? "rounded-full bg-hover px-2 py-0.5 font-medium text-text"
                  : "font-medium text-text"
              }
            >
              @{comment.author.handle}
            </Link>
            {comment.author.id === ownerId && <span className="text-faint">· {t("comments.creator")}</span>}
            <span className="text-faint">{comment.ago}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-text">
            <RichText text={comment.body} />
          </p>
          <div className="mt-1 flex items-center gap-1">
            {me && !isReply && (
              <button className="btn btn-quiet h-8 px-3 text-xs" onClick={() => setReplying(true)}>
                {t("comments.reply")}
              </button>
            )}
            {canDelete && (
              <button
                className="btn btn-quiet h-8 px-3 text-xs"
                onClick={() => start(() => deleteCommentAction(comment.id, videoId))}
                disabled={pending}
              >
                {t("comments.delete")}
              </button>
            )}
          </div>
          {replying && me && (
            <div className="mt-2">
              <CommentForm videoId={videoId} parentId={comment.id} me={me} autoFocus onDone={() => setReplying(false)} />
            </div>
          )}
          {comment.replies.length > 0 && (
            <div className="mt-3 space-y-4">
              {comment.replies.map((reply) => (
                <Comment key={reply.id} comment={reply} videoId={videoId} ownerId={ownerId} me={me} canModerate={canModerate} isReply />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Comments({
  videoId,
  ownerId,
  count,
  comments,
  me,
  canModerate,
}: {
  videoId: string;
  ownerId: string;
  count: number;
  comments: CommentItem[];
  me: Me | null;
  canModerate: boolean;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <section className="mt-6" id="comments">
      <h2 className="mb-5 text-xl font-bold text-text">
        {count === 1 ? t("comments.titleOne") : t("comments.title", { count })}
      </h2>
      {me ? (
        <CommentForm videoId={videoId} me={me} />
      ) : (
        <p className="text-sm text-muted">
          <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="font-medium text-[#8ab4ff] hover:underline">
            {t("nav.signIn")}
          </Link>{" "}
          · {t("comments.signIn")}
        </p>
      )}
      <div className="mt-6 space-y-6">
        {comments.length === 0 ? (
          <p className="text-sm text-faint">{t("comments.empty")}</p>
        ) : (
          comments.map((comment) => (
            <Comment key={comment.id} comment={comment} videoId={videoId} ownerId={ownerId} me={me} canModerate={canModerate} />
          ))
        )}
      </div>
    </section>
  );
}
