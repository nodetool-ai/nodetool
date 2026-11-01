import { presetParameterKeys } from "./params.js";
import type { Catalog } from "./catalog.js";
import { modelFamily } from "./families.js";
import type { Preset, PresetMode } from "./schema.js";
import { MAX_PRESET_STACK, presetPairBlock } from "./stack.js";

export interface CompileOptions {
  modelId: string;
  mode: PresetMode;
  prompt: string;
  catalog: Catalog;
}
export interface CompiledPresets {
  prompt: string;
  params: Preset["params"];
  applied: string[];
  warnings: string[];
}

/** Compile a validated stack in request order, rejecting incompatible presets. */
export function compilePresets(ids: readonly string[], options: CompileOptions): CompiledPresets {
  if (ids.length > MAX_PRESET_STACK) { throw new Error("At most three presets can be applied"); }
  const presets = ids.map((id) => {
    const preset = options.catalog.getPreset(id);
    if (!preset && options.catalog.getStudio(id)) {
      throw new Error(`${id} is a studio: it opens a surface and has nothing to compile`);
    }
    if (!preset) { throw new Error(`Unknown preset: ${id}`); }
    if (!preset.modes.includes(options.mode)) {
      throw new Error(`Preset ${id} does not support mode ${options.mode}`);
    }
    return preset;
  });
  for (let i = 0; i < presets.length; i++) {
    for (let j = i + 1; j < presets.length; j++) {
      const a = presets[i];
      const b = presets[j];
      if (presetPairBlock(a, b)) {
        throw new Error(`Presets ${a.id} and ${b.id} cannot combine`);
      }
    }
  }
  let prompt = options.prompt;
  const params = new Map<string, string | number | boolean>();
  const owners = new Map<string, string>();
  const warnings: string[] = [];
  const family = modelFamily(options.modelId);
  const acceptedKeys = presetParameterKeys(options.mode);
  for (const preset of presets) {
    const hasFamily = family !== null && Object.hasOwn(preset.prompt, family);
    const fragment = preset.prompt[hasFamily ? family : "default"];
    if (!hasFamily) {
      warnings.push(`Preset ${preset.id} has no fragment for ${family ?? options.modelId}, using default`);
    }
    if (typeof fragment === "string") {
      prompt = [prompt, fragment].filter(Boolean).join(" ");
    } else {
      prompt = [fragment.prefix, fragment.replace ?? prompt, fragment.suffix].filter(Boolean).join(" ");
    }
    const scoped = preset.family_params ?? {};
    const familyParams = family === null ? {} : scoped[family] ?? {};
    const selectedParams = { ...preset.params, ...familyParams };
    for (const key of new Set(Object.values(scoped).flatMap((values) => Object.keys(values)))) {
      if (!Object.hasOwn(selectedParams, key)) {
        warnings.push(`Preset ${preset.id} parameter ${key} dropped for ${family ?? options.modelId}: no family value`);
      }
    }
    for (const [key, value] of Object.entries(selectedParams)) {
      // Generic generation has no fps input. Negative-prompt support varies by
      // endpoint and mode within a family, so neither is safe family-wide.
      if (!acceptedKeys.includes(key)) {
        warnings.push(`Preset ${preset.id} parameter ${key} dropped for ${family ?? options.modelId}: not supported by the generic generation path`);
        continue;
      }
      const owner = owners.get(key);
      if (owner && params.get(key) !== value) {
        throw new Error(`Parameter ${key} conflicts between ${owner} and ${preset.id}`);
      }
      params.set(key, value);
      owners.set(key, preset.id);
    }
  }
  return { prompt, params: Object.fromEntries(params), applied: presets.map((preset) => preset.id), warnings };
}
