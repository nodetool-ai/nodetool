/**
 * ShotStatusPill
 *
 * The one status vocabulary the shot grid speaks, rendered as a mono pill in
 * the thumbnail's bottom-right corner. Four tones: a rendered clip (success
 * green), a render in flight (video violet, matching the card's border and
 * the progress bar under the thumbnail), a shot waiting on its next step
 * (neutral), and a failed render (error).
 */

import { memo } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import type { Shot } from "@nodetool-ai/protocol";

import {
  Box,
  BORDER_RADIUS,
  CONTROL,
  SPACING,
  TYPOGRAPHY
} from "../ui_primitives";
import { colorForType } from "../../config/data_types";
import { hexToRgba } from "../../utils/ColorUtils";
import { brighten, toHex } from "../../utils/colorMath";

/** Video violet — the app's colour for anything clip-shaped. */
export const CLIP_COLOR = colorForType("video");
/** The same violet, lifted off the tinted background it sits on. */
const CLIP_TEXT = toHex(brighten(CLIP_COLOR, 1.4));

export type ShotPillTone = "done" | "rendering" | "neutral" | "failed";

export interface ShotPill {
  tone: ShotPillTone;
  label: string;
}

/** True while the shot is waiting on a still or a clip render. */
export const isShotGenerating = (shot: Shot): boolean =>
  shot.status === "keyframe_generating" || shot.status === "clip_generating";

/**
 * What the pill says about a shot: the step it is on, and — once there is a
 * clip — how long that clip runs.
 */
export const shotPill = (
  shot: Shot,
  durationSeconds?: number | null
): ShotPill => {
  if (isShotGenerating(shot)) {
    return {
      tone: "rendering",
      label: shot.status === "clip_generating" ? "rendering clip" : "rendering still"
    };
  }
  if (shot.status === "failed") {
    return { tone: "failed", label: "failed" };
  }
  if (shot.clip) {
    return {
      tone: "done",
      label: durationSeconds != null ? `clip · ${durationSeconds}s` : "clip"
    };
  }
  if (shot.keyframe) {
    return { tone: "neutral", label: "still · clip queued" };
  }
  return { tone: "neutral", label: "planned" };
};

/** Border and background for a tone, shared with the card's own border. */
export const toneColors = (
  tone: ShotPillTone,
  theme: Theme
): { color: string; border: string; background: string } => {
  switch (tone) {
    case "done": {
      const green = theme.palette.success.main;
      return {
        color: green,
        border: hexToRgba(green, 0.5),
        background: hexToRgba(green, 0.12)
      };
    }
    case "rendering":
      return {
        color: CLIP_TEXT,
        border: CLIP_COLOR,
        background: hexToRgba(CLIP_COLOR, 0.16)
      };
    case "failed": {
      const red = theme.palette.error.main;
      return {
        color: red,
        border: hexToRgba(red, 0.5),
        background: hexToRgba(red, 0.12)
      };
    }
    default:
      return {
        color: theme.palette.text.secondary,
        border: theme.palette.divider,
        background: hexToRgba(theme.palette.common.white, 0.06)
      };
  }
};

interface ShotStatusPillProps {
  shot: Shot;
  /** The shot's effective length, shown once it has a clip. */
  durationSeconds?: number | null;
  sx?: SxProps<Theme>;
}

const ShotStatusPillInner = ({
  shot,
  durationSeconds,
  sx
}: ShotStatusPillProps) => {
  const theme = useTheme();
  const pill = shotPill(shot, durationSeconds);
  const colors = toneColors(pill.tone, theme);

  return (
    <Box
      data-testid="shot-status-pill"
      data-tone={pill.tone}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        height: `${CONTROL.height.xs}px`,
        px: SPACING.sm,
        borderRadius: BORDER_RADIUS.pill,
        border: "1px solid",
        borderColor: colors.border,
        backgroundColor: colors.background,
        color: colors.color,
        whiteSpace: "nowrap",
        ...TYPOGRAPHY.mono.caption,
        ...sx
      }}
    >
      {pill.label}
    </Box>
  );
};

export const ShotStatusPill = memo(ShotStatusPillInner);
ShotStatusPill.displayName = "ShotStatusPill";

export default ShotStatusPill;
