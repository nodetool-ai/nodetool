/**
 * shotCameraPresets
 *
 * The pure half of the shot editor's camera preset field: which cards a shot
 * shows as selected, what a pick writes into the draft, and the camera clause
 * a render would send for the board's video model. The render path compiles
 * `camera.preset_ids` in `@nodetool-ai/storyboard`; this mirrors its mode
 * mapping so the preview and the render agree.
 */

import {
  cameraPresetIdsForMovement,
  compileCameraPresets,
  compilePresets,
  modelFamily,
  type Catalog,
  type ModelFamily,
  type PresetMode
} from "@nodetool-ai/presets";
import type { ShotRenderMode } from "@nodetool-ai/protocol";

import type { ShotDraft } from "./shotDraft";

/** The preset mode a shot's clip render runs in. */
export const presetModeForRender = (mode: ShotRenderMode): PresetMode =>
  mode === "direct"
    ? "video"
    : mode === "reference"
      ? "reference_to_video"
      : "image_to_video";

/**
 * The cards to show as selected. A board saved before presets carries only
 * `movement`, so its alias match preselects a card without writing to the board.
 */
export const selectedPresetIds = (
  draft: Pick<ShotDraft, "presetIds" | "movement">,
  catalog: Catalog
): string[] =>
  draft.presetIds.length > 0
    ? draft.presetIds
    : cameraPresetIdsForMovement(draft.movement, catalog);

/**
 * The draft fields a pick writes. `movement` holds the catalogue's English
 * names so the screenplay camera pass and the CSV export keep reading it.
 * Clearing the stack clears `movement` too: it only held the preset names, and
 * an alias left behind would select its card again.
 */
export const draftPatchForPresets = (
  ids: string[],
  catalog: Catalog
): Pick<ShotDraft, "presetIds" | "movement"> => ({
  presetIds: ids,
  movement: ids
    .map((id) => catalog.getPreset(id)?.name)
    .filter((name): name is string => name !== undefined)
    .join(", ")
});

export interface ShotCameraPreview {
  /** What `clipPromptFor` takes as `compiledCamera`; absent without presets. */
  compiled?: { clause: string; replacesEquipment: boolean };
  family: ModelFamily | null;
  /** Presets that have no fragment for the family and use `default`. */
  fallbackIds: string[];
  /** Why the stack could not compile, e.g. a mode the preset does not support. */
  error?: string;
}

/** Compile a shot's preset stack for a video model, as a render would. */
export const previewShotCamera = (
  presetIds: readonly string[] | undefined,
  modelId: string | null | undefined,
  renderMode: ShotRenderMode,
  catalog: Catalog
): ShotCameraPreview => {
  const id = modelId ?? "";
  const family = modelFamily(id);
  if (!presetIds?.length) {
    return { family, fallbackIds: [] };
  }
  const mode = presetModeForRender(renderMode);
  try {
    const compiled = compileCameraPresets(presetIds, {
      modelId: id,
      mode,
      catalog
    });
    const { applied, warnings } = compilePresets(presetIds, {
      modelId: id,
      mode,
      prompt: "",
      catalog
    });
    // Warnings are one per fallback preset, in stack order; `applied` names
    // every preset, so match them by the id each warning carries.
    const fallbackIds = applied.filter((presetId) =>
      warnings.some((warning) => warning.startsWith(`Preset ${presetId} `))
    );
    return { compiled, family, fallbackIds };
  } catch (error) {
    return {
      family,
      fallbackIds: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
};
