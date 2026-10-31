import { z } from "zod";
import { loadPackageAssetJson } from "@nodetool-ai/config";
import {
  loadCatalog,
  compileMediaPresets,
  presetModeSchema,
  presetSchema,
  MODEL_FAMILIES
} from "@nodetool-ai/presets";
import type { CapabilityModule } from "./types.js";
import { presetsSpecs } from "./presets.specs.js";
export function presetCatalog() {
  return loadCatalog(() =>
    loadPackageAssetJson(
      { pkg: "@nodetool-ai/presets", path: "preset-catalog.json" },
      import.meta.url
    )
  );
}
export const module: CapabilityModule = {
  module: "presets",
  exports: presetsSpecs.map((spec) => ({
    spec,
    impl: async (_run, params) => {
      try {
        const catalog = presetCatalog();
        if (spec.name === "list_presets") {
          const filter = z
            .object({
              kind: presetSchema.shape.kind.optional(),
              mode: presetModeSchema.optional(),
              family: z.enum(MODEL_FAMILIES).optional()
            })
            .parse(params);
          return catalog
            .filter(filter)
            .filter(
              (preset) =>
                !filter.family ||
                preset.families?.includes(filter.family) ||
                Object.hasOwn(preset.prompt, filter.family)
            );
        }
        if (spec.name === "get_preset") {
          const id = z.string().parse(params["id"]);
          const preset = catalog.getPreset(id);
          if (!preset) {
            throw new Error(`Unknown preset: ${id}`);
          }
          return preset;
        }
        const input = z
          .object({
            preset_ids: z.array(z.string()).max(3),
            provider: z.string().default(""),
            model: z.string(),
            mode: presetModeSchema,
            prompt: z.string().default("")
          })
          .parse(params);
        return compileMediaPresets(
          input.preset_ids,
          input.provider,
          input.model,
          input.mode,
          input.prompt,
          catalog
        );
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  }))
};
