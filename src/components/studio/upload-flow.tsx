"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, CloudUpload, ImagePlus, LoaderCircle, TriangleAlert } from "lucide-react";
import { publishAction, type FormState } from "@/app/actions/studio";
import { formatBytes, formatDuration } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "../i18n";
import { DetailsFields } from "./details-fields";

type Phase = "idle" | "uploading" | "processing" | "done" | "error";

interface Frame {
  url: string;
  blob: Blob;
}

/** Read a local file's size and length, and cut three candidate thumbnails from it. */
async function readVideo(file: File): Promise<{ duration: number; width: number; height: number; frames: Frame[] }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("unreadable"));
    });
    const { duration, videoWidth: width, videoHeight: height } = video;
    const frames: Frame[] = [];
    if (width > 0 && height > 0 && Number.isFinite(duration)) {
      const scale = Math.min(1, 1280 / width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext("2d");
      for (const at of [0.1, 0.4, 0.7]) {
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
          video.currentTime = Math.max(0.1, duration * at);
        });
        context?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
        if (blob) frames.push({ url: URL.createObjectURL(blob), blob });
      }
    }
    return { duration: Number.isFinite(duration) ? duration : 0, width, height, frames };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function titleFrom(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

export function UploadFlow({
  maxBytes,
  seriesOptions,
}: {
  maxBytes: number;
  seriesOptions: Array<{ id: string; title: string }>;
}) {
  const t = useT();
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [choice, setChoice] = useState<number | "custom" | "auto">(0);
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [state, formAction, publishing] = useActionState<FormState, FormData>(publishAction, null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const customInput = useRef<HTMLInputElement>(null);
  const customFile = useRef<File | null>(null);

  useEffect(() => () => xhr.current?.abort(), []);

  const start = (picked: File) => {
    setFile(picked);
    setUploadError(null);
    setUploadId(null);
    setPhase("uploading");
    setProgress(0);
    setFrames([]);
    setChoice(0);
    setMeta(null);

    readVideo(picked)
      .then((info) => {
        setMeta({ duration: info.duration, width: info.width, height: info.height });
        setFrames(info.frames);
        if (info.frames.length === 0) setChoice("auto");
      })
      // A codec this browser cannot decode still uploads; the server cuts the thumbnail.
      .catch(() => setChoice("auto"));

    if (picked.size > maxBytes) {
      setPhase("error");
      setUploadError(t("upload.error.too_large"));
      return;
    }

    const request = new XMLHttpRequest();
    xhr.current = request;
    request.open("POST", "/api/uploads");
    request.setRequestHeader("Content-Type", picked.type || "application/octet-stream");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.upload.onload = () => setPhase("processing");
    request.onload = () => {
      let body: { uploadId?: string; error?: { code?: string } } = {};
      try {
        body = JSON.parse(request.responseText);
      } catch {
        /* not JSON: reported below by status */
      }
      if (request.status === 201 && body.uploadId) {
        setUploadId(body.uploadId);
        setPhase("done");
      } else {
        setPhase("error");
        const code = body.error?.code;
        setUploadError(code ? t(`upload.error.${code}` as MessageKey, { detail: "" }) : `HTTP ${request.status}`);
      }
    };
    request.onerror = () => {
      setPhase("error");
      setUploadError(t("upload.error.network"));
    };
    request.send(picked);
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.delete("thumbnail");
    if (choice === "custom" && customFile.current) data.set("thumbnail", customFile.current);
    else if (typeof choice === "number" && frames[choice]) data.set("thumbnail", frames[choice].blob, "thumbnail.jpg");
    startTransition(() => formAction(data));
  };

  if (!file) {
    return (
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = event.dataTransfer.files[0];
          if (dropped) start(dropped);
        }}
        className={clsx(
          "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-24 text-center transition-colors",
          dragging ? "border-brand bg-brand-dim" : "border-line hover:border-line-bright",
        )}
      >
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-raised text-muted">
          <CloudUpload size={44} />
        </span>
        <span className="text-lg font-medium text-text">{t("upload.drop")}</span>
        <span className="text-sm text-muted">{t("upload.formats", { size: formatBytes(maxBytes) })}</span>
        <span className="btn btn-light mt-2">{t("upload.choose")}</span>
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
          className="sr-only"
          data-testid="video-file"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            if (picked) start(picked);
          }}
        />
      </label>
    );
  }

  const publishError = state?.error ? t(`upload.error.${state.error}` as MessageKey, { detail: state.detail ?? "" }) : null;

  return (
    <form onSubmit={onSubmit} className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <input type="hidden" name="uploadId" value={uploadId ?? ""} />
      <input type="hidden" name="clientDurationSec" value={meta?.duration ?? ""} />
      <input type="hidden" name="clientWidth" value={meta?.width ?? ""} />
      <input type="hidden" name="clientHeight" value={meta?.height ?? ""} />

      <div className="order-2 lg:order-1">
        <h2 className="mb-4 text-xl font-semibold text-text">{t("upload.details")}</h2>
        <DetailsFields
          initial={{
            title: titleFrom(file.name),
            description: "",
            visibility: "public",
            category: "drama",
            tags: [],
            aiUsage: "generated",
            aiModels: [],
            prompt: null,
            seriesId: null,
            episodeNumber: null,
          }}
          seriesOptions={seriesOptions}
        />

        <div className="mt-6">
          <span className="label">{t("upload.thumbnail")}</span>
          <p className="hint mb-3">{t("upload.thumbnailHint")}</p>
          <div className="flex flex-wrap gap-3">
            {frames.map((frame, index) => (
              <button
                type="button"
                key={frame.url}
                onClick={() => setChoice(index)}
                className={clsx(
                  "relative aspect-video w-36 overflow-hidden rounded-lg border-2",
                  choice === index ? "border-brand" : "border-transparent opacity-70 hover:opacity-100",
                )}
              >
                <img src={frame.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
            {frames.length === 0 && (
              <button
                type="button"
                onClick={() => setChoice("auto")}
                className={clsx(
                  "flex aspect-video w-36 items-center justify-center rounded-lg border-2 bg-raised text-xs text-muted",
                  choice === "auto" ? "border-brand" : "border-transparent",
                )}
              >
                {t("upload.autoThumbnail")}
              </button>
            )}
            <button
              type="button"
              onClick={() => customInput.current?.click()}
              className={clsx(
                "relative flex aspect-video w-36 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border-2 border-dashed text-xs text-muted",
                choice === "custom" ? "border-brand" : "border-line hover:border-line-bright",
              )}
            >
              {customUrl ? (
                <img src={customUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <>
                  <ImagePlus size={20} />
                  {t("upload.customThumbnail")}
                </>
              )}
            </button>
            <input
              ref={customInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const picked = event.target.files?.[0];
                if (!picked) return;
                customFile.current = picked;
                if (customUrl) URL.revokeObjectURL(customUrl);
                setCustomUrl(URL.createObjectURL(picked));
                setChoice("custom");
              }}
            />
          </div>
        </div>

        {publishError && (
          <p className="mt-6 rounded-md bg-bad-dim px-3 py-2 text-sm text-bad" role="alert">
            {publishError}
          </p>
        )}
        <div className="mt-8 flex items-center justify-end gap-3 border-t border-line pt-6">
          {!uploadId && phase !== "error" && <span className="text-sm text-muted">{t("upload.waitForUpload")}</span>}
          <button className="btn btn-primary px-6" disabled={!uploadId || publishing}>
            {publishing ? <LoaderCircle size={16} className="animate-spin" /> : null}
            {t(publishing ? "upload.publishing" : "upload.publish")}
          </button>
        </div>
      </div>

      <aside className="order-1 lg:order-2">
        <div className="overflow-hidden rounded-xl bg-surface lg:sticky lg:top-20">
          <div className="relative aspect-video bg-black">
            {frames[0] ? (
              <img src={(typeof choice === "number" && frames[choice]?.url) || (choice === "custom" && customUrl) || frames[0].url} alt="" className="h-full w-full object-contain" />
            ) : null}
          </div>
          <div className="space-y-3 p-4 text-sm">
            <div className="truncate font-medium text-text">{file.name}</div>
            <div className="text-xs text-muted">
              {formatBytes(file.size)}
              {meta && meta.duration > 0 && ` · ${t("upload.duration", { duration: formatDuration(meta.duration) })}`}
              {meta && meta.width > 0 && ` · ${t("upload.size", { width: meta.width, height: meta.height })}`}
            </div>
            {phase === "uploading" && (
              <div>
                <div className="mb-1 text-xs text-muted">{t("upload.uploading", { percent: progress })}</div>
                <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                  <div className="h-full bg-brand transition-[width]" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
            {phase === "processing" && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <LoaderCircle size={14} className="animate-spin" /> {t("upload.processing")}
              </div>
            )}
            {phase === "done" && (
              <div className="flex items-center gap-2 text-xs text-good" data-testid="upload-done">
                <CheckCircle2 size={14} /> {t("upload.uploaded")}
              </div>
            )}
            {phase === "error" && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-xs text-bad">
                  <TriangleAlert size={14} className="mt-0.5 shrink-0" /> {t("upload.failed", { reason: uploadError ?? "" })}
                </div>
                <button type="button" className="btn btn-ghost h-8 text-xs" onClick={() => setFile(null)}>
                  {t("upload.retry")}
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </form>
  );
}
