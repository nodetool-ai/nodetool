import { z } from "zod";
import { presetSchema, type Preset, type PresetMode } from "./schema.js";

export interface PresetFilter {
  kind?: Preset["kind"];
  mode?: PresetMode;
}
export interface Catalog {
  readonly presets: readonly Preset[];
  getPreset(id: string): Preset | undefined;
  byAlias(text: string): Preset | undefined;
  filter(filter: PresetFilter): Preset[];
}

/** Parse catalogue data and reject ambiguous ids, names and aliases. */
export function createCatalog(data: unknown): Catalog {
  const presets = z.array(presetSchema).min(1).parse(data);
  const ids = new Map<string, Preset>();
  const aliases = new Map<string, Preset>();
  for (const preset of presets) {
    if (ids.has(preset.id)) { throw new Error(`Duplicate preset id: ${preset.id}`); }
    ids.set(preset.id, preset);
    for (const alias of [preset.name, ...preset.aliases]) {
      const key = alias.toLowerCase();
      const previous = aliases.get(key);
      if (previous && previous.id !== preset.id) {
        throw new Error(`Alias "${alias}" belongs to both ${previous.id} and ${preset.id}`);
      }
      aliases.set(key, preset);
    }
  }
  return {
    presets,
    getPreset: (id) => ids.get(id),
    byAlias: (text) => aliases.get(text.toLowerCase()),
    filter: ({ kind, mode }) => presets.filter((preset) =>
      (!kind || preset.kind === kind) && (!mode || preset.modes.includes(mode)))
  };
}

/** Load through a host-supplied reader, such as config's loadPackageAssetJson. */
export function loadCatalog(loader: () => unknown): Catalog {
  return createCatalog(loader());
}
