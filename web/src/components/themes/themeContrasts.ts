/**
 * The theme contrast levels a user can pick in Settings > Appearance.
 * "standard" is the shipped dark and light palettes. "soft" lifts the dark
 * surfaces off near-black and dims the light ones off white, with text
 * toned down to match, for long editing sessions.
 */
export const THEME_CONTRASTS = ["standard", "soft"] as const;
export type ThemeContrast = (typeof THEME_CONTRASTS)[number];

export const DEFAULT_THEME_CONTRAST: ThemeContrast = "standard";

export const THEME_CONTRAST_LABELS: Record<ThemeContrast, string> = {
  standard: "Standard",
  soft: "Soft"
};

export const isThemeContrast = (value: unknown): value is ThemeContrast =>
  typeof value === "string" &&
  (THEME_CONTRASTS as readonly string[]).includes(value);
