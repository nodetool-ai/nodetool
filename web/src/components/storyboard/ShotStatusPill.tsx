/**
 * ShotStatusPill
 *
 * What the shot grid says about a shot, in the app's shared pill vocabulary
 * (`StatusPill`): a rendered clip and its length, a render in flight (video
 * violet, matching the card's border and the progress bar under the
 * thumbnail), a shot waiting on its next step, or a failed render.
 */

import { memo } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import type { Shot } from "@nodetool-ai/protocol";

import { StatusPill, type StatusPillTone } from "../ui_primitives";
import { colorForType } from "../../config/data_types";

/** Video violet — the app's colour for anything clip-shaped. */
export const CLIP_COLOR = colorForType("video");

export interface ShotPill {
  tone: StatusPillTone;
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
  const pill = shotPill(shot, durationSeconds);
  return (
    <StatusPill
      tone={pill.tone}
      accent={CLIP_COLOR}
      data-testid="shot-status-pill"
      sx={sx}
    >
      {pill.label}
    </StatusPill>
  );
};

export const ShotStatusPill = memo(ShotStatusPillInner);
ShotStatusPill.displayName = "ShotStatusPill";

export default ShotStatusPill;
