import { z } from "zod";

export const localeSchema = z.enum(["en", "zh-CN"]);
export type Locale = z.infer<typeof localeSchema>;
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "简体中文" }
] as const;

export function resolveLocale(value: unknown): Locale {
  const result = localeSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_LOCALE;
}
