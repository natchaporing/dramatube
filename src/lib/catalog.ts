/**
 * The fixed vocabularies: categories, the models a creator can credit, and
 * the reasons a viewer can give for a report. Kept as data so the upload form,
 * the search filters and the API all validate against one list.
 */

export const CATEGORIES = [
  "drama",
  "short-film",
  "music-video",
  "animation",
  "comedy",
  "sci-fi",
  "horror",
  "commercial",
  "trailer",
  "documentary",
  "experimental",
  "tutorial",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

/**
 * Models a creator is likely to credit, spelled the way their makers spell
 * them. Anything else can still be typed; a known name is canonicalised so
 * "veo", "VEO" and "Veo" are one filter rather than three.
 */
export const KNOWN_MODELS = [
  "Veo",
  "Sora",
  "Kling",
  "Seedance",
  "Runway",
  "Luma Ray",
  "Hailuo",
  "Wan",
  "LTX",
  "Pika",
  "Midjourney",
  "Nano Banana",
  "GPT Image",
  "FLUX",
  "Seedream",
  "Stable Diffusion",
  "ElevenLabs",
  "Suno",
  "Udio",
  "DramaStudio",
] as const;

export const MAX_MODELS = 12;
export const MAX_MODEL_LENGTH = 40;

export function canonicalModel(name: string): string | null {
  const cleaned = name.replace(/\s+/g, " ").trim().slice(0, MAX_MODEL_LENGTH);
  if (!cleaned) return null;
  const known = KNOWN_MODELS.find((model) => model.toLowerCase() === cleaned.toLowerCase());
  return known ?? cleaned;
}

/** Comma- or newline-separated model names, de-duplicated, canonicalised. */
export function parseModels(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(/[,\n]/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const model = canonicalModel(part);
    if (!model || seen.has(model.toLowerCase())) continue;
    seen.add(model.toLowerCase());
    out.push(model);
    if (out.length >= MAX_MODELS) break;
  }
  return out;
}

export const MAX_TAGS = 15;

/** Tags: lowercase, no leading #, 1–30 characters, at most fifteen. */
export function parseTags(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(/[,\n]/);
  const seen = new Set<string>();
  for (const part of parts) {
    const tag = part.trim().replace(/^#+/, "").replace(/\s+/g, " ").toLowerCase().slice(0, 30);
    if (tag) seen.add(tag);
    if (seen.size >= MAX_TAGS) break;
  }
  return [...seen];
}

export const AI_USAGE = ["generated", "assisted"] as const;
export type AiUsage = (typeof AI_USAGE)[number];

export const VISIBILITIES = ["public", "unlisted", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const REPORT_REASONS = [
  "undisclosed",
  "misleading",
  "impersonation",
  "sexual",
  "violent",
  "hateful",
  "spam",
  "copyright",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const LIMITS = {
  title: 100,
  description: 5000,
  prompt: 4000,
  comment: 2000,
  bio: 1000,
  channelName: 60,
  seriesTitle: 100,
  reportDetails: 1000,
} as const;
