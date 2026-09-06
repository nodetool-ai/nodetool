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
  /** A bar line — stronger than a subdivision. */
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
  barLine: "rgba(255, 255, 255, 0.22)",
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
  barLine: "rgba(0, 0, 0, 0.22)",
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
    barLine: palette?.text?.disabled ?? fallback.barLine,
    note: palette?.primary?.main ?? fallback.note,
    noteSelected: palette?.text?.primary ?? fallback.noteSelected,
    text: palette?.text?.secondary ?? fallback.text,
    marquee: fallback.marquee
  };
}
