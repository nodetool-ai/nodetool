import { z } from "zod";
import { runtimePresetCatalog } from "@nodetool-ai/pack-core/preset-catalog";
import {
  compileMediaPresets,
  catalogKindSchema,
  listCatalog,
  presetModeSchema,
  MODEL_FAMILIES
} from "@nodetool-ai/presets";
import type { CapabilityModule } from "./types.js";
import { presetsSpecs } from "./presets.specs.js";
export const presetCatalog = runtimePresetCatalog;
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
              kind: catalogKindSchema.optional(),
              mode: presetModeSchema.optional(),
              family: z.enum(MODEL_FAMILIES).optional()
            })
            .parse(params);
          return listCatalog(catalog, filter);
        }
        if (spec.name === "get_preset") {
          const id = z.string().parse(params["id"]);
          const preset = catalog.getPreset(id) ?? catalog.getStudio(id);
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
