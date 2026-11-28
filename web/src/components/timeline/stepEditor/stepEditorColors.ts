/**
 * Concrete color strings for the Step Editor's canvas. The base palette is the
 * piano roll's; this adds the lane-row shades and the beam colors.
 */

import type { Theme } from "@mui/material/styles";
import { velocityColor } from "@nodetool-ai/timeline";

import {
  NEUTRAL_NOTE_RGB,
  mixToward,
  parseCssColor,
  pickPianoRollColors,
  rgbCss,
  type PianoRollColors,
  type Rgb
} from "../pianoRoll/pianoRollColors";

/** How much lighter the selected lane row is than the others. */
const SELECTED_ROW_MIX = 0.06;
/** A selected beam is its color mixed this far toward white. */
const SELECTED_BEAM_MIX = 0.5;
/** A frame is the beam color mixed this far toward black. */
const FRAME_MIX = 0.35;
/** Muted beams draw at this opacity. */
const MUTED_ALPHA = 0.45;

export interface StepEditorColors extends PianoRollColors {
  selectedRow: string;
  /** The theme primary color the controller beams use. */
  primary: Rgb;
  /** The line of the Line tool's preview. */
  preview: string;
  mutedAlpha: number;
}

export function pickStepEditorColors(
  theme: Theme,
  mode: "light" | "dark"
): StepEditorColors {
  const base = pickPianoRollColors(theme, mode);
  const row = parseCssColor(base.whiteRow);
  return {
    ...base,
    selectedRow: row
      ? rgbCss(mixToward(row, mode === "dark" ? 255 : 0, SELECTED_ROW_MIX))
      : base.whiteRow,
    primary: parseCssColor(base.note) ?? NEUTRAL_NOTE_RGB,
    preview: base.noteSelected,
    mutedAlpha: MUTED_ALPHA
  };
}

export interface BeamColors {
  fill: string;
  frame: string;
}

/** The fill and frame of a beam. Note lanes color by velocity, others by the primary color. */
export function beamColors(
  colors: StepEditorColors,
  noteVelocity: number | null,
  selected: boolean
): BeamColors {
  const base: Rgb =
    noteVelocity === null ? colors.primary : (velocityColor(noteVelocity) as Rgb);
  const fill = selected ? mixToward(base, 255, SELECTED_BEAM_MIX) : base;
  return { fill: rgbCss(fill), frame: rgbCss(mixToward(fill, 0, FRAME_MIX)) };
}
