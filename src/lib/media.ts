import { spawn } from "node:child_process";
import { open, rename, unlink } from "node:fs/promises";
import { env } from "./env";

/**
 * What an uploaded file really is.
 *
 * ffprobe is the authority when it is installed: it reads the container, so a
 * renamed text file or a video with no picture is refused, and the duration
 * and size are measured rather than reported. Without it the browser's
 * reading is used, and the file's first bytes are still checked.
 */

export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;
export type AcceptedVideoType = (typeof ACCEPTED_VIDEO_TYPES)[number];

export function isAcceptedVideoType(value: string): value is AcceptedVideoType {
  return (ACCEPTED_VIDEO_TYPES as readonly string[]).includes(value);
}

/** The container a file's first bytes announce, whatever it was named. */
export function sniffVideo(head: Uint8Array): AcceptedVideoType | null {
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return "video/webm";
  }
  if (head.length >= 12) {
    const box = String.fromCharCode(head[4], head[5], head[6], head[7]);
    if (box === "ftyp") {
      const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
      return brand === "qt  " ? "video/quicktime" : "video/mp4";
    }
    // Older QuickTime files can open with any of these atoms instead.
    if (["moov", "mdat", "wide", "free", "skip"].includes(box)) return "video/quicktime";
  }
  return null;
}

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

export function sniffImage(head: Uint8Array): ImageType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) {
    return "image/png";
  }
  if (
    head.length >= 12 &&
    String.fromCharCode(head[0], head[1], head[2], head[3]) === "RIFF" &&
    String.fromCharCode(head[8], head[9], head[10], head[11]) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export const IMAGE_EXTENSIONS: Record<ImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const VIDEO_EXTENSIONS: Record<AcceptedVideoType, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export async function readHead(path: string, bytes = 16): Promise<Uint8Array> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function run(command: string, args: string[], timeoutMs = 60_000): Promise<{ code: number; stdout: Buffer; stderr: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      if (err.length < 8000) err += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveRun({ code: code ?? 1, stdout: Buffer.concat(out), stderr: err });
    });
  });
}

let toolsPresent: boolean | null = null;

/** Whether ffmpeg and ffprobe can be run, asked once per process. */
export async function hasFfmpeg(): Promise<boolean> {
  if (toolsPresent !== null) return toolsPresent;
  try {
    const [probe, mpeg] = await Promise.all([
      run(env.ffprobePath, ["-version"], 5000),
      run(env.ffmpegPath, ["-version"], 5000),
    ]);
    toolsPresent = probe.code === 0 && mpeg.code === 0;
  } catch {
    toolsPresent = false;
  }
  return toolsPresent;
}

export interface ProbeResult {
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
  videoCodec: string;
}

/** Display dimensions: a phone video stored sideways is shown upright. */
export function displaySize(width: number, height: number, rotation: number): { width: number; height: number } {
  const quarterTurns = Math.round(Math.abs(rotation) / 90) % 2;
  return quarterTurns === 1 ? { width: height, height: width } : { width, height };
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  tags?: Record<string, string>;
  side_data_list?: Array<{ rotation?: number }>;
}

export function parseProbe(json: string): ProbeResult | null {
  const data = JSON.parse(json) as { streams?: FfprobeStream[]; format?: { duration?: string } };
  const video = data.streams?.find((stream) => stream.codec_type === "video" && stream.width && stream.height);
  if (!video) return null;
  const rotation =
    video.side_data_list?.find((side) => typeof side.rotation === "number")?.rotation ??
    Number(video.tags?.rotate ?? 0);
  const size = displaySize(video.width ?? 0, video.height ?? 0, rotation || 0);
  const duration = Number(data.format?.duration ?? video.duration ?? 0);
  return {
    durationSec: Number.isFinite(duration) ? duration : 0,
    width: size.width,
    height: size.height,
    hasAudio: Boolean(data.streams?.some((stream) => stream.codec_type === "audio")),
    videoCodec: video.codec_name ?? "",
  };
}

/** Null when ffprobe is present and says the file has no picture in it. */
export async function probeVideo(path: string): Promise<ProbeResult | null> {
  const result = await run(env.ffprobePath, [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    path,
  ]);
  if (result.code !== 0) return null;
  try {
    return parseProbe(result.stdout.toString());
  } catch {
    return null;
  }
}

/** One frame as a JPEG, scaled to at most 1280 wide. */
export async function extractThumbnail(path: string, atSec: number): Promise<Buffer | null> {
  const result = await run(env.ffmpegPath, [
    "-v", "error",
    "-ss", Math.max(0, atSec).toFixed(2),
    "-i", path,
    "-frames:v", "1",
    "-vf", "scale='min(1280,iw)':-2",
    "-q:v", "3",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "pipe:1",
  ]);
  return result.code === 0 && result.stdout.length > 0 ? result.stdout : null;
}

/**
 * Rewrite an MP4 or MOV with its index at the front, without re-encoding.
 * Phones and most exporters put the index at the end, which makes a browser
 * fetch the tail of the file before it can show the first frame. A QuickTime
 * file comes out as MP4, which is what every browser actually plays.
 *
 * Returns the type of the file now at `path`; on any failure the original is
 * left exactly as it was.
 */
export async function faststart(path: string, type: AcceptedVideoType): Promise<AcceptedVideoType> {
  if (type === "video/webm") return type;
  // A name of its own, so nothing else that touches this upload can collide with it.
  const out = `${path}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.faststart.mp4`;
  const result = await run(
    env.ffmpegPath,
    ["-v", "error", "-y", "-i", path, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-movflags", "+faststart", "-f", "mp4", out],
    10 * 60_000,
  );
  if (result.code !== 0) {
    await unlink(out).catch(() => {});
    return type;
  }
  await rename(out, path);
  return "video/mp4";
}
