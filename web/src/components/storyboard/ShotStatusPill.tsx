/**
 * ShotStatusPill
 *
 * What the shot grid says about a shot, in the app's shared pill vocabulary
 * (`StatusPill`): a render in flight (video violet, matching the card's border
 * and the progress bar under the thumbnail), a shot waiting on its next step,
 * or a failed render. A finished clip says nothing — the card plays it, and
 * its length is already in the shot label.
 */

import { memo } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import type { Shot } from "@nodetool-ai/protocol";

import { StatusPill, type StatusPillTone } from "../ui_primitives";
import { colorForType } from "../../config/data_types";
import {
  useStoryboardGenerationStore,
  type ShotGenerationStatus
} from "../../stores/storyboard/StoryboardGenerationStore";

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
 * What the pill says about a shot: the step it is on, or nothing once the
 * clip is there. `jobStatus` is the shot's own entry in
 * {@link useStoryboardGenerationStore} — the same read the card's progress
 * bar uses — so "clip queued" only shows while a clip render has actually
 * been requested, not for every stilled shot that has not gotten to one yet.
 */
export const shotPill = (
  shot: Shot,
  jobStatus?: ShotGenerationStatus
): ShotPill | null => {
  if (isShotGenerating(shot)) {
    return {
      tone: "rendering",
      label:
        shot.status === "clip_generating" ? "rendering clip" : "rendering still"
    };
  }
  if (shot.status === "failed") {
    return { tone: "failed", label: "failed" };
  }
  if (shot.clip) {
    return null;
  }
  // A shot fused into a sibling's generation has its picture but no clip of
  // its own, and a card that says "still" reads as a shot nobody has rendered.
  if (shot.covered_by) {
    return { tone: "neutral", label: "covered" };
  }
  if (shot.keyframe) {
    const clipQueued = jobStatus === "queued" || jobStatus === "running";
    return clipQueued
      ? { tone: "neutral", label: "still · clip queued" }
      : { tone: "neutral", label: "still" };
  }
  return { tone: "neutral", label: "planned" };
};

interface ShotStatusPillProps {
  shot: Shot;
  sx?: SxProps<Theme>;
}

const ShotStatusPillInner = ({ shot, sx }: ShotStatusPillProps) => {
  const jobStatus = useStoryboardGenerationStore(
    (state) => state.shotJobs[shot.id]?.status
  );
  const pill = shotPill(shot, jobStatus);
  if (!pill) {
    return null;
  }
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
