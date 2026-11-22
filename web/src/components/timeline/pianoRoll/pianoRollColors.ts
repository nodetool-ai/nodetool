/**
 * Concrete color strings for the piano roll's canvases.
 *
 * Canvas 2D cannot parse `var(--…)`, and under nodetool's `cssVariables` theme
 * `theme.palette.X` *is* a var string — so, like `TimeRuler`, the values come
 * from `theme.colorSchemes[mode].palette`, which carries the plain values for
 * each mode.
 */

import type { Theme } from "@mui/material/styles";

export interface PianoRollColors {
  /** The grid's ground, under a white key's row. */
  whiteRow: string;
  /** A black key's row, drawn a shade darker. */
  blackRow: string;
  /** The part of the grid outside the clip's window. */
  outsideWindow: string;
  /** A subdivision line. */
  gridLine: string;
  /** A beat line, between a subdivision and a bar line. */
  beatLine: string;
  /** A bar line — the strongest grid line. */
  barLine: string;
  /** A note bar. */
  note: string;
  /** A selected note's outline. */
  noteSelected: string;
  /** Text on a note or a key. */
  text: string;
  /** The marquee's fill and outline. */
  marquee: string;
}

const DARK_FALLBACK: PianoRollColors = {
  whiteRow: "rgb(24, 25, 28)",
  blackRow: "rgb(17, 18, 20)",
  outsideWindow: "rgba(0, 0, 0, 0.45)",
  gridLine: "rgba(255, 255, 255, 0.08)",
  beatLine: "rgba(255, 255, 255, 0.22)",
  barLine: "rgba(255, 255, 255, 0.55)",
  note: "rgb(91, 155, 213)",
  noteSelected: "rgb(240, 240, 240)",
  text: "rgb(160, 160, 160)",
  marquee: "rgba(91, 155, 213, 0.25)"
};

const LIGHT_FALLBACK: PianoRollColors = {
  whiteRow: "rgb(255, 255, 255)",
  blackRow: "rgb(238, 236, 233)",
  outsideWindow: "rgba(0, 0, 0, 0.12)",
  gridLine: "rgba(0, 0, 0, 0.08)",
  beatLine: "rgba(0, 0, 0, 0.22)",
  barLine: "rgba(0, 0, 0, 0.55)",
  note: "rgb(25, 118, 210)",
  noteSelected: "rgb(20, 20, 20)",
  text: "rgb(90, 85, 80)",
  marquee: "rgba(25, 118, 210, 0.2)"
};

/** The palette the piano roll draws with, for one color mode. */
export function pickPianoRollColors(
  theme: Theme,
  mode: "light" | "dark"
): PianoRollColors {
  const palette = theme.colorSchemes?.[mode]?.palette;
  const fallback = mode === "dark" ? DARK_FALLBACK : LIGHT_FALLBACK;
  return {
    whiteRow: palette?.background?.paper ?? fallback.whiteRow,
    blackRow: palette?.background?.default ?? fallback.blackRow,
    outsideWindow: fallback.outsideWindow,
    gridLine: palette?.divider ?? fallback.gridLine,
    beatLine: palette?.text?.disabled ?? fallback.beatLine,
    barLine: palette?.text?.secondary ?? fallback.barLine,
    note: palette?.primary?.main ?? fallback.note,
    noteSelected: palette?.text?.primary ?? fallback.noteSelected,
    text: palette?.text?.secondary ?? fallback.text,
    marquee: fallback.marquee
  };
}

export type Rgb = readonly [number, number, number];

/** Parse `#rgb`, `#rrggbb` or `rgb(r, g, b)`. Anything else (a CSS variable) is null. */
export function parseCssColor(value: string | undefined): Rgb | null {
  if (!value) return null;
  const text = value.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  if (short) {
    return [short[1], short[2], short[3]].map((h) => parseInt(h + h, 16)) as unknown as Rgb;
  }
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text);
  if (long) return [parseInt(long[1], 16), parseInt(long[2], 16), parseInt(long[3], 16)];
  const fn = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(text);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  return null;
}

/** Mix `rgb` toward black (`target` 0) or white (`target` 255) by `amount` 0..1. */
export function mixToward(rgb: Rgb, target: 0 | 255, amount: number): Rgb {
  return [
    Math.round(rgb[0] + (target - rgb[0]) * amount),
    Math.round(rgb[1] + (target - rgb[1]) * amount),
    Math.round(rgb[2] + (target - rgb[2]) * amount)
  ];
}

export const rgbCss = (rgb: Rgb): string => `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

/** How dark a note's border is: the note color mixed this far toward black. */
const NOTE_BORDER_MIX = 0.35;
/** How light a note's velocity line is: the note color mixed this far toward white. */
const NOTE_LINE_MIX = 0.5;

/** The fill, border and velocity-line colors of a note drawn in `base`. */
export function noteDrawColors(base: Rgb): {
  fill: string;
  border: string;
  line: string;
} {
  return {
    fill: rgbCss(base),
    border: rgbCss(mixToward(base, 0, NOTE_BORDER_MIX)),
    line: rgbCss(mixToward(base, 255, NOTE_LINE_MIX))
  };
}

/** Black or white, whichever reads on `rgb`. */
export function readableOn(rgb: Rgb): "dark" | "light" {
  const luma = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luma > 0.6 ? "dark" : "light";
}

/** Fallback note color when the theme gives none the canvas can read. */
export const NEUTRAL_NOTE_RGB: Rgb = [91, 155, 213];
