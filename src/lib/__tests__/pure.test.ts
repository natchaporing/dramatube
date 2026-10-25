import { describe, expect, it } from "vitest";
import { canonicalModel, parseModels, parseTags } from "../catalog";
import { formatDuration, isVertical, timeAgo } from "../format";
import { handleProblem, normalizeHandle, suggestHandle } from "../handles";
import { en } from "../i18n/en";
import { th } from "../i18n/th";
import { negotiate, translate } from "../i18n";
import { displaySize, parseProbe, sniffImage, sniffVideo } from "../media";
import { sameOrigin } from "../origin";
import { contentTypeFor, parseRange } from "../range";
import { safeNext } from "../safe-next";

describe("handles", () => {
  it("normalises an @ and case away", () => {
    expect(normalizeHandle("  @NeonLotus ")).toBe("neonlotus");
  });
  it("refuses what would be confusing or collide with a route", () => {
    expect(handleProblem("ab")).toBe("length");
    expect(handleProblem("-dash")).toBe("characters");
    expect(handleProblem("ไท")).toBe("length");
    expect(handleProblem("ไทยไทยไทย")).toBe("characters");
    expect(handleProblem("studio")).toBe("reserved");
    expect(handleProblem("paper.moon_01")).toBeNull();
  });
  it("suggests something valid from a name or an email", () => {
    expect(handleProblem(suggestHandle("Paper Moon Pictures"))).toBeNull();
    expect(handleProblem(suggestHandle("é@example.com"))).toBeNull();
    expect(handleProblem(suggestHandle("มิ้นท์"))).toBeNull();
    expect(suggestHandle("Admin")).toBe("admin-tv");
  });
});

describe("catalog", () => {
  it("canonicalises known model names and keeps unknown ones", () => {
    expect(canonicalModel("veo")).toBe("Veo");
    expect(canonicalModel("  nano   banana ")).toBe("Nano Banana");
    expect(canonicalModel("My LoRA v2")).toBe("My LoRA v2");
    expect(canonicalModel("   ")).toBeNull();
  });
  it("de-duplicates models case-insensitively and caps the list", () => {
    expect(parseModels("veo, VEO, Kling")).toEqual(["Veo", "Kling"]);
    expect(parseModels(Array.from({ length: 30 }, (_, i) => `m${i}`))).toHaveLength(12);
  });
  it("cleans tags", () => {
    expect(parseTags("#Romance, romance,  Bangkok  Night ,")).toEqual(["romance", "bangkok night"]);
  });
});

describe("format", () => {
  it("formats durations the way players do", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(7.9)).toBe("0:07");
    expect(formatDuration(187)).toBe("3:07");
    expect(formatDuration(3723)).toBe("1:02:03");
  });
  it("says how long ago", () => {
    const now = new Date("2026-10-25T12:00:00Z");
    expect(timeAgo(new Date("2026-10-23T12:00:00Z"), "en", now)).toBe("2 days ago");
    expect(timeAgo(new Date("2026-10-25T11:59:30Z"), "en", now)).toBe("this minute");
  });
  it("calls 9:16 vertical and 16:9 not", () => {
    expect(isVertical(720, 1280)).toBe(true);
    expect(isVertical(1280, 720)).toBe(false);
    expect(isVertical(0, 0)).toBe(false);
  });
});

describe("range", () => {
  it("answers the ranges a video element sends", () => {
    expect(parseRange("bytes=0-", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange("bytes=100-199", 1000)).toEqual({ start: 100, end: 199 });
    expect(parseRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
  });
  it("refuses what cannot be satisfied and ignores what it does not understand", () => {
    expect(parseRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=500-100", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=0-1,5-6", 1000)).toBeNull();
    expect(parseRange(null, 1000)).toBeNull();
  });
  it("types files by extension", () => {
    expect(contentTypeFor("videos/a/b.mp4")).toBe("video/mp4");
    expect(contentTypeFor("thumbs/a/b.webp")).toBe("image/webp");
    expect(contentTypeFor("x/y.exe")).toBe("application/octet-stream");
  });
});

describe("media", () => {
  const bytes = (...values: Array<number | string>) =>
    new Uint8Array(values.flatMap((value) => (typeof value === "string" ? [...value].map((c) => c.charCodeAt(0)) : [value])));
  it("knows a video by its first bytes, not its name", () => {
    expect(sniffVideo(bytes(0, 0, 0, 0x20, "ftypisom"))).toBe("video/mp4");
    expect(sniffVideo(bytes(0, 0, 0, 0x14, "ftypqt  "))).toBe("video/quicktime");
    expect(sniffVideo(bytes(0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0))).toBe("video/webm");
    expect(sniffVideo(bytes("<html><body>"))).toBeNull();
  });
  it("knows an image by its first bytes", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImage(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImage(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("image/webp");
    expect(sniffImage(bytes("GIF89a"))).toBeNull();
  });
  it("turns a phone video stored sideways upright", () => {
    expect(displaySize(1920, 1080, -90)).toEqual({ width: 1080, height: 1920 });
    expect(displaySize(1920, 1080, 180)).toEqual({ width: 1920, height: 1080 });
  });
  it("reads ffprobe output, and refuses a file with no picture", () => {
    const probe = parseProbe(
      JSON.stringify({
        streams: [
          { codec_type: "video", codec_name: "h264", width: 1920, height: 1080, side_data_list: [{ rotation: 90 }] },
          { codec_type: "audio" },
        ],
        format: { duration: "12.5" },
      }),
    );
    expect(probe).toEqual({ durationSec: 12.5, width: 1080, height: 1920, hasAudio: true, videoCodec: "h264" });
    expect(parseProbe(JSON.stringify({ streams: [{ codec_type: "audio" }], format: { duration: "3" } }))).toBeNull();
  });
});

describe("i18n", () => {
  it("has a Thai string for every English key", () => {
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(th[key], key).toBeTruthy();
    }
  });
  it("keeps every placeholder in the translation", () => {
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      const wanted = (en[key].match(/\{\w+\}/g) ?? []).sort();
      const got = (th[key].match(/\{\w+\}/g) ?? []).sort();
      expect(got, key).toEqual(wanted);
    }
  });
  it("fills placeholders and leaves unknown ones visible", () => {
    expect(translate(en, "video.views", { count: "1.2K" })).toBe("1.2K views");
    expect(translate(en, "video.views")).toBe("{count} views");
  });
  it("picks a language from the browser's list", () => {
    expect(negotiate("th-TH,th;q=0.9,en;q=0.8")).toBe("th");
    expect(negotiate("fr-FR,en;q=0.5")).toBe("en");
    expect(negotiate("de")).toBe("en");
    expect(negotiate(undefined)).toBe("en");
  });
});

describe("safety helpers", () => {
  it("only redirects to a path on this site", () => {
    expect(safeNext("/watch/abc")).toBe("/watch/abc");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext(undefined, "/studio")).toBe("/studio");
  });
  it("rejects a cross-site POST", () => {
    const request = (origin: string | null, host = "dramatube.example") =>
      new Request("https://dramatube.example/api/x", {
        method: "POST",
        headers: { host, ...(origin ? { origin } : {}) },
      });
    expect(sameOrigin(request("https://dramatube.example"))).toBe(true);
    expect(sameOrigin(request("https://evil.example"))).toBe(false);
    expect(sameOrigin(request(null))).toBe(true);
  });
});
