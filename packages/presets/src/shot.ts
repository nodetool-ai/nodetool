import type { Shot, ShotPromptContext } from "@nodetool-ai/protocol";
import type { Catalog } from "./catalog.js";
import { compilePresetStack } from "./compile.js";
import { MAX_PRESET_STACK } from "./stack.js";
import type { PresetMode } from "./schema.js";

/** Empty shot selections inherit the board look. Unsupported look modes are omitted. */
export function compileShotPresets(
  shot: Shot,
  boardLookIds: readonly string[],
  options: {
    catalog: Catalog;
    modelId: string;
    mode: PresetMode;
  }
): {
  context: ShotPromptContext;
  params: Record<string, string | number | boolean>;
  warnings: string[];
  applied: string[];
} {
  const cameraIds =
    options.mode === "image" ? [] : (shot.camera?.preset_ids ?? []);
  const lookIds = shot.look_preset_ids?.length
    ? shot.look_preset_ids
    : boardLookIds;
  for (const [ids, kind] of [
    [cameraIds, "camera"],
    [lookIds, "look"]
  ] as const) {
    for (const id of ids) {
      const preset = options.catalog.getPreset(id);
      if (!preset) {
        throw new Error(`Unknown preset: ${id}`);
      }
      if (preset.kind !== kind) {
        throw new Error(`Preset ${id} is not a ${kind} preset`);
      }
    }
  }
  if (cameraIds.length + lookIds.length > MAX_PRESET_STACK) {
    throw new Error("At most three presets can be applied");
  }
  const supportedLooks = lookIds.filter((id) =>
    options.catalog.getPreset(id)?.modes.includes(options.mode)
  );
  const compiled = compilePresetStack([...cameraIds, ...supportedLooks], {
    ...options,
    prompt: ""
  });
  const clause = (ids: readonly string[]): string =>
    compiled.clauses
      .filter((item) => ids.includes(item.id))
      .map((item) => item.prompt)
      .join(" ");
  return {
    context: {
      ...(cameraIds.length > 0 && {
        compiledCamera: {
          clause: clause(cameraIds),
          replacesEquipment: cameraIds.some(
            (id) => options.catalog.getPreset(id)?.slot === "rig"
          )
        }
      }),
      ...(supportedLooks.length > 0 && { compiledLook: clause(supportedLooks) })
    },
    applied: compiled.applied,
    params: compiled.params,
    warnings: compiled.warnings
  };
}
