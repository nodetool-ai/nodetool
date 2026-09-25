/**
 * The model vocabulary shared by the board's batch render dialogs and the
 * per-shot render dialog: which catalog task a shot's still or clip needs,
 * and how a stored {@link ShotModelRef} becomes a picker value.
 */

import {
  shotRenderMode,
  type requiredVideoTasksForShots,
  type Shot,
  type ShotModelRef
} from "@nodetool-ai/protocol";

import { CONTROL } from "../ui_primitives";
import type {
  ImageModelTask,
  VideoModelTask
} from "../../hooks/useModelsByProvider";
import type { ImageModelValue, VideoModelValue } from "../../stores/ApiTypes";

// Stills can come from a plain generator or an editing model; the latter can
// take entity reference images, so the picker offers both.
export const STILL_MODEL_TASKS: ImageModelTask[] = [
  "text_to_image",
  "image_to_image"
];

export const clipTaskForShot = (shot: Shot): VideoModelTask => {
  const mode = shotRenderMode(shot);
  return mode === "reference"
    ? "reference_to_video"
    : mode === "direct"
      ? "text_to_video"
      : "image_to_video";
};

/**
 * The clip tasks a board can ask for, keyed off the helper that produces them
 * so the labels cannot drift from it. A shot renders one of three ways; the
 * rest of `VideoModelTask` (revision, lip sync, upscaling, interpolation,
 * outpainting) never reaches this picker.
 */
export type ClipModelTask = ReturnType<
  typeof requiredVideoTasksForShots
>[number];

export const CLIP_TASK_LABELS: Record<ClipModelTask, string> = {
  image_to_video: "Animate stills",
  text_to_video: "Generate from prompts",
  reference_to_video: "Use entity references"
};

export const imageValue = (model: ShotModelRef): ImageModelValue => ({
  type: "image_model",
  id: model.id,
  provider: model.provider,
  name: model.name ?? model.id,
  path: ""
});

export const videoValue = (model: ShotModelRef): VideoModelValue => ({
  type: "video_model",
  id: model.id,
  provider: model.provider,
  name: model.name ?? model.id
});

// The model pickers are custom buttons, not InputBase controls; hold them at
// the shared form-control height. Scoped to the picker's own class so no
// other button that ends up inside the field is affected.
export const modelFieldSx = {
  "& .select-model-button": { minHeight: `${CONTROL.height.lg}px` }
} as const;
