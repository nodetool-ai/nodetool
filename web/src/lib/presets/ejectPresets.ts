/**
 * The graph behind "Open as workflow": the preset (or stack of presets) a
 * generation used, ejected for the mode it ran in. The graph comes from the
 * shared `presetToWorkflow`, so the web, the CLI and agents open the same one.
 */

import {
  compilePresets,
  presetToWorkflow,
  type Preset,
  type PresetMode,
  type PresetWorkflowGraph
} from "@nodetool-ai/presets";

import { presetCatalog } from "./catalog";

export interface EjectModel {
  readonly provider: string;
  readonly id: string;
  readonly name?: string;
}

/** The modes a generation of this media kind can have run in, best first. */
const MODES_BY_KIND: Record<"image" | "video", readonly PresetMode[]> = {
  image: ["image_edit", "image"],
  video: ["image_to_video", "video", "reference_to_video"]
};
/** The same modes for a preset that starts from text, best first. */
const TEXT_MODES_BY_KIND: Record<"image" | "video", readonly PresetMode[]> = {
  image: ["image", "image_edit"],
  video: ["video", "image_to_video", "reference_to_video"]
};

/**
 * The mode to eject a preset for, given the kind of media it made. A preset
 * that takes a picture prefers the picture-fed mode.
 */
export const ejectModeFor = (
  preset: Pick<Preset, "modes" | "inputs">,
  kind: "image" | "video"
): PresetMode | null => {
  const ordered = preset.inputs.includes("image")
    ? MODES_BY_KIND[kind]
    : TEXT_MODES_BY_KIND[kind];
  return ordered.find((mode) => preset.modes.includes(mode)) ?? null;
};

/**
 * Eject the presets a generation used. One preset ejects as it is. A stack
 * ejects as its first preset carrying the compiled text and parameters of the
 * whole stack, so the opened graph renders what the generation rendered.
 */
export const ejectPresetIds = (
  ids: readonly string[],
  kind: "image" | "video",
  model: EjectModel
): { graph: PresetWorkflowGraph; preset: Preset; mode: PresetMode } | null => {
  const [firstId] = ids;
  const first = firstId ? presetCatalog.getPreset(firstId) : undefined;
  if (!first) {
    return null;
  }
  const mode = ejectModeFor(first, kind);
  if (!mode) {
    return null;
  }
  if (ids.length === 1) {
    return {
      graph: presetToWorkflow(first, { model, mode }),
      preset: first,
      mode
    };
  }
  const compiled = compilePresets([...ids], {
    catalog: presetCatalog,
    modelId: model.id,
    mode,
    prompt: ""
  });
  const stacked: Preset = {
    ...first,
    prompt: { default: compiled.prompt },
    params: compiled.params
  };
  return {
    graph: presetToWorkflow(stacked, { model, mode }),
    preset: first,
    mode
  };
};
