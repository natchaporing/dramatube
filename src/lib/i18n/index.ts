import { en, type MessageKey } from "./en";
import { th } from "./th";

export type { MessageKey };
export const LOCALES = ["en", "th"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "dt_lang";

export const LOCALE_NAMES: Record<Locale, string> = { en: "English", th: "ไทย" };

const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, th };

export function dictionary(locale: Locale): Record<MessageKey, string> {
  return dictionaries[locale];
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export type Vars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: Vars) => string;

export function translate(messages: Record<MessageKey, string>, key: MessageKey, vars?: Vars): string {
  const template = messages[key] ?? en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function translator(locale: Locale): Translate {
  const messages = dictionary(locale);
  return (key, vars) => translate(messages, key, vars);
}

/** The first supported language in an Accept-Language header. */
export function negotiate(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((param) => param.trim().startsWith("q="));
      return { lang: tag.toLowerCase().split("-")[0], q: q ? Number(q.split("=")[1]) : 1 };
    })
    .filter((entry) => entry.lang && Number.isFinite(entry.q) && entry.q > 0)
    .sort((a, b) => b.q - a.q);
  return ranked.map((entry) => entry.lang).find(isLocale) ?? DEFAULT_LOCALE;
}
