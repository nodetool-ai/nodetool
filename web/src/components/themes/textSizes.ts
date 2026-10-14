/**
 * The app-wide text sizes a user can pick in Settings > Appearance. Each maps
 * the five-step sans scale (display, title, body, label, caption) to pixels.
 */
export const TEXT_SIZES = ["small", "default", "large", "larger"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const DEFAULT_TEXT_SIZE: TextSize = "default";

export interface TextSizeScale {
  giant: number;
  big: number;
  normal: number;
  small: number;
  smaller: number;
}

export const TEXT_SIZE_SCALES: Record<TextSize, TextSizeScale> = {
  small: { giant: 20, big: 16, normal: 14, small: 12, smaller: 10 },
  default: { giant: 22, big: 18, normal: 15, small: 13, smaller: 11 },
  large: { giant: 24, big: 20, normal: 17, small: 15, smaller: 12 },
  larger: { giant: 26, big: 22, normal: 19, small: 17, smaller: 14 }
};

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  small: "Small",
  default: "Default",
  large: "Large",
  larger: "Larger"
};

export const isTextSize = (value: unknown): value is TextSize =>
  typeof value === "string" && (TEXT_SIZES as readonly string[]).includes(value);
