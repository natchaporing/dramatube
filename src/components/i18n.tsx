"use client";

import { createContext, useContext, useMemo } from "react";
import { translate, type Locale, type MessageKey, type Translate } from "@/lib/i18n";

const I18nContext = createContext<{ locale: Locale; t: Translate } | null>(null);

/**
 * The dictionary is serialised once at the root and every Client Component
 * below reads it from here, so nothing threads strings down by hand.
 */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Record<MessageKey, string>;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ locale, t: ((key, vars) => translate(messages, key, vars)) as Translate }),
    [locale, messages],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n outside I18nProvider");
  return value;
}

export function useT(): Translate {
  return useI18n().t;
}
