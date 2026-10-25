/**
 * HTTP Range for media. A browser seeking in a video asks for byte ranges;
 * answering with the whole file instead means a scrub to minute ten waits
 * for minutes one to nine to download.
 *
 * One range only — multipart ranges are legal and nobody's video element
 * sends them, so they are answered with the whole file, which is also legal.
 */
export type RangeResult = { start: number; end: number } | "unsatisfiable" | null;

export function parseRange(header: string | null | undefined, size: number): RangeResult {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;
  if (size === 0) return "unsatisfiable";

  if (rawStart === "") {
    // A suffix: the last N bytes.
    const suffix = Number(rawEnd);
    if (suffix === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(rawStart);
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (start >= size || end < start) return "unsatisfiable";
  return { start, end };
}

const TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function contentTypeFor(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return TYPES[ext] ?? "application/octet-stream";
}
