import { z } from "zod";

export const localeSchema = z.enum([
  "en",
  "de",
  "fi",
  "ru",
  "zh-CN",
  "es",
  "pt",
  "fr",
  "it",
  "pl",
  "sv",
  "nb",
  "nl",
  "ko",
  "ja",
  "hi"
]);
export type Locale = z.infer<typeof localeSchema>;
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "fi", label: "Suomi" },
  { value: "ru", label: "Русский" },
  { value: "zh-CN", label: "简体中文" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
  { value: "pl", label: "Polski" },
  { value: "sv", label: "Svenska" },
  { value: "nb", label: "Norsk bokmål" },
  { value: "nl", label: "Nederlands" },
  { value: "ko", label: "한국어" },
  { value: "ja", label: "日本語" },
  { value: "hi", label: "हिन्दी" }
] as const;

export function resolveLocale(value: unknown): Locale {
  const result = localeSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_LOCALE;
}

/**
 * The supported locale closest to the browser's language list, for a user
 * who has not picked one. The page opts out of browser translation (see
 * web/index.html), so without this a non-English browser would get English.
 */
export function browserLocale(
  languages: readonly string[] = typeof navigator === "undefined"
    ? []
    : navigator.languages?.length
      ? navigator.languages
      : [navigator.language]
): Locale {
  const supported: readonly string[] = localeSchema.options;
  for (const language of languages) {
    if (!language) {
      continue;
    }
    if (supported.includes(language)) {
      return language as Locale;
    }
    const base = language.split("-")[0].toLowerCase();
    if (base === "zh") {
      return "zh-CN";
    }
    if (base === "no" || base === "nn") {
      return "nb";
    }
    if (supported.includes(base)) {
      return base as Locale;
    }
  }
  return DEFAULT_LOCALE;
}
