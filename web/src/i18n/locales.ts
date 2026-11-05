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
