import { z } from "zod";
import type { ModelFamily } from "./families.js";
import type { Preset, PresetMode } from "./schema.js";
import { canAddPreset } from "./stack.js";
import { catalogEntrySchema, type CatalogEntry, type CatalogKind, type Studio } from "./studio.js";

export interface PresetFilter {
  kind?: Preset["kind"];
  mode?: PresetMode;
}
export interface Catalog {
  /** Generation presets: camera, look and effect. */
  readonly presets: readonly Preset[];
  readonly studios: readonly Studio[];
  getPreset(id: string): Preset | undefined;
  getStudio(id: string): Studio | undefined;
  byAlias(text: string): Preset | undefined;
  filter(filter: PresetFilter): Preset[];
}

/** Why a studio's preset ids do not fit its target, or null when they do. */
export function studioPresetProblem(
  studio: Studio,
  getPreset: (id: string) => Preset | undefined
): string | null {
  const { target } = studio;
  if (target.type !== "create" && target.type !== "effects") {
    return studio.preset_ids.length > 0 ? `Studio ${studio.id}: a ${target.type} target takes no presets` : null;
  }
  const selection: Preset[] = [];
  for (const id of studio.preset_ids) {
    const preset = getPreset(id);
    if (!preset) { return `Studio ${studio.id}: unknown preset ${id}`; }
    if (target.type === "effects") {
      if (preset.kind !== "effect") { return `Studio ${studio.id}: ${id} is not an effect`; }
      continue;
    }
    if (preset.kind === "effect") { return `Studio ${studio.id}: the Create view takes no effect (${id})`; }
    const check = canAddPreset(selection, preset, { mode: target.mode });
    if (!check.ok) { return `Studio ${studio.id}: ${id} cannot join the stack (${check.reason})`; }
    selection.push(preset);
  }
  return null;
}

/** Parse catalogue data and reject ambiguous ids, names and aliases, and unfit studios. */
export function createCatalog(data: unknown): Catalog {
  const entries: CatalogEntry[] = z.array(catalogEntrySchema).min(1).parse(data);
  const presets: Preset[] = [];
  const studios: Studio[] = [];
  const ids = new Map<string, Preset>();
  const studioIds = new Map<string, Studio>();
  const aliases = new Map<string, Preset>();
  const studioNames = new Map<string, Studio>();
  for (const entry of entries) {
    if (ids.has(entry.id) || studioIds.has(entry.id)) { throw new Error(`Duplicate preset id: ${entry.id}`); }
    if (entry.kind === "studio") {
      const previous = studioNames.get(entry.name.toLowerCase());
      if (previous) { throw new Error(`Studio name "${entry.name}" belongs to both ${previous.id} and ${entry.id}`); }
      studioNames.set(entry.name.toLowerCase(), entry);
      studioIds.set(entry.id, entry);
      studios.push(entry);
      continue;
    }
    ids.set(entry.id, entry);
    presets.push(entry);
    for (const alias of [entry.name, ...entry.aliases]) {
      const key = alias.toLowerCase();
      const previous = aliases.get(key);
      if (previous && previous.id !== entry.id) {
        throw new Error(`Alias "${alias}" belongs to both ${previous.id} and ${entry.id}`);
      }
      aliases.set(key, entry);
    }
  }
  for (const studio of studios) {
    const problem = studioPresetProblem(studio, (id) => ids.get(id));
    if (problem) { throw new Error(problem); }
  }
  return {
    presets,
    studios,
    getPreset: (id) => ids.get(id),
    getStudio: (id) => studioIds.get(id),
    byAlias: (text) => aliases.get(text.toLowerCase()),
    filter: ({ kind, mode }) => presets.filter((preset) =>
      (!kind || preset.kind === kind) && (!mode || preset.modes.includes(mode)))
  };
}

/** Load through a host-supplied reader, such as config's loadPackageAssetJson. */
export function loadCatalog(loader: () => unknown): Catalog {
  return createCatalog(loader());
}

export interface CatalogListFilter {
  kind?: CatalogKind;
  mode?: PresetMode;
  family?: ModelFamily;
}

/**
 * Catalogue rows for the CLI and agent listings. Mode and family describe
 * generation presets, so a filter naming either lists no studios.
 */
export function listCatalog(catalog: Catalog, { kind, mode, family }: CatalogListFilter): (Preset | Studio)[] {
  const studios = !mode && !family && (!kind || kind === "studio") ? catalog.studios : [];
  const presets = kind === "studio" ? [] : catalog.filter({ kind, mode }).filter((preset) =>
    !family || preset.families?.includes(family) || Object.hasOwn(preset.prompt, family));
  return [...presets, ...studios];
}
