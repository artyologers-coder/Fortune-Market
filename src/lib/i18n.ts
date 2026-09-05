import si from "@/i18n/si.json";
import en from "@/i18n/en.json";

export type Locale = "si" | "en";

const dictionaries: Record<Locale, typeof si> = { si, en };

export function getDictionary(locale: Locale) {
  return dictionaries[locale] ?? dictionaries.en;
}

export const DEFAULT_LOCALE: Locale = "en";

export type Dictionary = ReturnType<typeof getDictionary>;
