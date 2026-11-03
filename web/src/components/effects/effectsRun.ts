/**
 * The Effects gallery's decisions, kept apart from the components: which
 * generation mode an effect runs in, which model it starts on, and the
 * `generate_media` request it sends.
 */

import type { GenerateMediaRequest } from "@nodetool-ai/protocol";
import type { Preset, PresetMode } from "@nodetool-ai/presets";

import type { ImageModel, VideoModel } from "../../stores/ApiTypes";
import {
  getRememberedModel,
  getRememberedModelForTask
} from "../../stores/lastModelStore";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { MediaMode } from "../../stores/MediaGenerationStore";
import { modelMatchesTask } from "../../hooks/modelTaskMatching";

/** The two modes an effect preset runs in. */
export type EffectMode = Extract<PresetMode, "image_to_video" | "image_edit">;

/** The media kind an effect's result is. */
export type EffectResultKind = "video" | "image";

export interface EffectModelRef {
  readonly id: string;
  readonly provider: string;
}

/** The mode an effect runs in. Image-to-video wins when a preset lists both. */
export const effectModeOf = (preset: Pick<Preset, "modes">): EffectMode =>
  preset.modes.includes("image_to_video") ? "image_to_video" : "image_edit";

/** The composer mode that owns the effect's model picker and provider check. */
export const composerModeOf = (mode: EffectMode): MediaMode => mode;

export const resultKindOf = (mode: EffectMode): EffectResultKind =>
  mode === "image_to_video" ? "video" : "image";

/** Image-to-video is `generate_media` mode "video" with a source asset. */
export const requestModeOf = (mode: EffectMode): "video" | "image_edit" =>
  mode === "image_to_video" ? "video" : "image_edit";

/** The `generate_media` request that applies one effect to one picture. */
export const buildEffectRequest = (
  preset: Pick<Preset, "id" | "modes">,
  model: EffectModelRef,
  sourceAssetId: string
): GenerateMediaRequest => ({
  mode: requestModeOf(effectModeOf(preset)),
  provider: model.provider,
  model: model.id,
  prompt: "",
  preset_ids: [preset.id],
  source_asset_id: sourceAssetId
});

interface RememberedRef {
  provider?: string;
  model?: string;
}

const asRef = (remembered: RememberedRef | undefined): EffectModelRef | null =>
  remembered?.model && remembered.provider
    ? { id: remembered.model, provider: remembered.provider }
    : null;

/** Models the picker could offer, narrowed to what the chosen mode can do. */
type CandidateModel = Pick<VideoModel | ImageModel, "id" | "provider"> & {
  supported_tasks?: string[] | null;
};

/**
 * The model an effect starts on, in the order every render surface uses: the
 * last model picked for this task, the last picked for this kind, then the
 * Settings default. A candidate counts only while a connected provider still
 * offers it, so a stale pick never reaches a request.
 */
export const defaultEffectModel = (
  mode: EffectMode,
  available: readonly CandidateModel[]
): EffectModelRef | null => {
  const video = mode === "image_to_video";
  const preferences = useModelPreferencesStore.getState().defaults[
    video ? "video_model" : "image_model"
  ];
  const candidates = [
    asRef(
      video
        ? getRememberedModelForTask("video", "image_to_video")
        : getRememberedModelForTask("image", "image_edit")
    ),
    asRef(getRememberedModel(video ? "video" : "image")),
    preferences ? { id: preferences.id, provider: preferences.provider } : null
  ];
  const task = video ? "image_to_video" : "image_to_image";
  for (const ref of candidates) {
    if (
      ref &&
      available.some(
        (model) =>
          model.id === ref.id &&
          model.provider === ref.provider &&
          modelMatchesTask(model.supported_tasks, task)
      )
    ) {
      return ref;
    }
  }
  return null;
};
