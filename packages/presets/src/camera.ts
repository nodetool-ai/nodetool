import type { ShotPromptContext } from "@nodetool-ai/protocol";
import type { Catalog } from "./catalog.js";
import { compilePresets, type CompileOptions } from "./compile.js";

/** Compile only camera direction, leaving the shot's action and motion intact. */
export function compileCameraPresets(
  ids: readonly string[] | undefined,
  options: Omit<CompileOptions, "prompt">
): ShotPromptContext["compiledCamera"] {
  if (!ids?.length) { return undefined; }
  for (const id of ids) {
    const preset = options.catalog.getPreset(id);
    if (preset && preset.kind !== "camera") {
      throw new Error(`Preset ${id} is not a camera preset`);
    }
  }
  const compiled = compilePresets(ids, { ...options, prompt: "" });
  return {
    clause: compiled.prompt,
    replacesEquipment: ids.some((id) => options.catalog.getPreset(id)?.slot === "rig")
  };
}

/** Preselect a legacy movement's matching card without changing stored direction. */
export function cameraPresetIdsForMovement(movement: string | undefined, catalog: Catalog): string[] {
  const preset = movement ? catalog.byAlias(movement.trim()) : undefined;
  return preset?.kind === "camera" ? [preset.id] : [];
}
