import type { Catalog } from "./catalog.js";
import { modelFamily } from "./families.js";
import type { Preset, PresetMode } from "./schema.js";

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
  if (ids.length > 3) { throw new Error("At most three presets can be applied"); }
  const presets = ids.map((id) => {
    const preset = options.catalog.getPreset(id);
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
      if (!a.stackable || !b.stackable || a.id === b.id ||
          (a.slot && a.slot === b.slot) ||
          a.conflicts.includes(b.id) || b.conflicts.includes(a.id)) {
        throw new Error(`Presets ${a.id} and ${b.id} cannot combine`);
      }
    }
  }
  let prompt = options.prompt;
  const params = new Map<string, string | number | boolean>();
  const owners = new Map<string, string>();
  const warnings: string[] = [];
  const family = modelFamily(options.modelId);
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
    for (const [key, value] of Object.entries(preset.params)) {
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
