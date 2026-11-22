/**
 * Region colors (spec 2.1). A region takes its track's color, muted: the name
 * band at the muted color, the body as a darker tint, the note lines as a lighter
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
  /** Name band: the muted track color. */
  band: string;
  /** Body fill: a darker tint in dark mode, a lighter tint in light mode. */
  body: string;
  /** Note lines and curves: reads against `body` in both modes. */
  content: string;
}

function toHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) {
    return [0, 0, l];
  }
  const d = max - min;
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
  return [h / 6, sat, l];
}

function fromHsl(h: number, sat: number, l: number): string {
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
  const p = 2 * l - q;
  const hue = (t: number): number => {
    const tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const channel = (v: number): string =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(hue(h + 1 / 3))}${channel(hue(h))}${channel(hue(h - 1 / 3))}`;
}

/**
 * The track color muted for a region: the hue kept, saturation and lightness
 * pulled to a narrow band so neighbouring regions read as one calm palette.
 */
export function muteRegionColor(color: string, mode: SchemeMode): string {
  const rgb = parseHex(color);
  if (!rgb) {
    return color;
  }
  const [h, sat] = toHsl(rgb);
  return mode === "dark"
    ? fromHsl(h, Math.min(sat, 0.85) * 0.5, 0.4)
    : fromHsl(h, Math.min(sat, 0.85) * 0.55, 0.62);
}

export function regionColors(
  base: string,
  mode: SchemeMode,
  paper: string,
  common: { black: string; white: string }
): RegionColors {
  const band = muteRegionColor(base, mode);
  if (mode === "light") {
    return {
      band,
      body: mixHex(band, paper, 0.62),
      content: mixHex(band, common.black, 0.6)
    };
  }
  return {
    band,
    body: mixHex(band, paper, 0.5),
    content: mixHex(band, common.white, 0.72)
  };
}
