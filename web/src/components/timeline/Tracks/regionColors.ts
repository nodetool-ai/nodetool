/**
 * Region colors (spec 2.1). A region takes its track's color: the name band
 * at full strength, the body as a darker tint, the note lines as a lighter
 * tint. A clip `labelColor` overrides the track color.
 *
 * Canvas 2D cannot resolve `var(--…)` or `color-mix()`, so these helpers
 * return plain hex colors from the active color scheme.
 */
import type { Theme } from "@mui/material/styles";

/** The default track colors, in track order, from the theme palette. */
const TRACK_PALETTE_KEYS = [
  "info",
  "success",
  "warning",
  "secondary",
  "primary",
  "error"
] as const;

type SchemeMode = "light" | "dark";

/** The plain hex color of the track at `trackIndex` in the active scheme. */
export function trackRegionColor(
  theme: Theme,
  mode: SchemeMode,
  trackIndex: number
): string {
  const key =
    TRACK_PALETTE_KEYS[
      ((trackIndex % TRACK_PALETTE_KEYS.length) + TRACK_PALETTE_KEYS.length) %
        TRACK_PALETTE_KEYS.length
    ];
  return (
    theme.colorSchemes?.[mode]?.palette?.[key]?.main ?? theme.palette[key].main
  );
}

function parseHex(color: string): [number, number, number] | null {
  const hex = color.trim().replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return null;
  }
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16)
  ];
}

/** Mix `color` toward `toward` by `amount` (0..1). Returns `color` if either is not hex. */
export function mixHex(color: string, toward: string, amount: number): string {
  const a = parseHex(color);
  const b = parseHex(toward);
  if (!a || !b) {
    return color;
  }
  const channel = (i: number): string =>
    Math.round(a[i] + (b[i] - a[i]) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

export interface RegionColors {
  /** Name band, full strength. */
  band: string;
  /** Body fill: a darker tint in dark mode, a lighter tint in light mode. */
  body: string;
  /** Note lines and curves: reads against `body` in both modes. */
  content: string;
}

export function regionColors(
  base: string,
  mode: SchemeMode,
  paper: string,
  common: { black: string; white: string }
): RegionColors {
  if (mode === "light") {
    return {
      band: base,
      body: mixHex(base, paper, 0.72),
      content: mixHex(base, common.black, 0.45)
    };
  }
  return {
    band: base,
    body: mixHex(base, paper, 0.62),
    content: mixHex(base, common.white, 0.62)
  };
}
