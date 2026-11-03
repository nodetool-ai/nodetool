import { z } from "zod";
import { resolveNodetoolDelegate } from "@nodetool-ai/protocol";
import { presetParameterKeys } from "./params.js";
import { compilePresets, type CompiledPresets } from "./compile.js";
import type { Catalog } from "./catalog.js";
import type { PresetMode } from "./schema.js";
/** Compile at the media boundary before provider work. */
export function compileMediaPresets(
  ids: unknown,
  provider: string,
  model: string,
  mode: string,
  prompt: string,
  catalog: Catalog
): CompiledPresets {
  const presetIds =
    z.array(z.string().min(1)).max(3).optional().parse(ids) ?? [];
  if (!presetIds.length) {
    return { prompt, params: {}, applied: [], warnings: [] };
  }
  let presetMode: PresetMode;
  switch (mode) {
    case "image":
    case "image_edit":
    case "video_edit":
    case "video":
    case "image_to_video":
    case "reference_to_video":
      presetMode = mode;
      break;
    default:
      throw new Error(`Presets do not support mode ${mode}`);
  }
  const task =
    presetMode === "video"
      ? "text_to_video"
      : presetMode === "image_edit"
        ? "image_to_image"
        : presetMode === "image"
          ? "text_to_image"
          : presetMode === "video_edit" ? "video_to_video" : presetMode;
  const modelId =
    provider === "nodetool"
      ? (resolveNodetoolDelegate(model, task)?.model ?? model)
      : model;
  return compilePresets(presetIds, {
    modelId,
    mode: presetMode,
    prompt,
    catalog
  });
}

/** Restrict catalogue parameters to settings accepted by the mode. */
export function mediaPresetSettings(
  compiled: CompiledPresets,
  mode: string
): Record<string, string | number | boolean> {
  const keys = presetParameterKeys(mode);
  return Object.fromEntries(
    Object.entries(compiled.params).filter(([key]) => keys.includes(key))
  );
}
