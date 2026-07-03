import type { PageEntry } from "./types";
import { staticEntries } from "./staticEntries";
import { competitorEntries } from "./competitorEntries";

/**
 * A page engine's contribution to the registry. `sample`, when set, tells the
 * smoke suite to walk only the first N indexable entries of this module (for
 * engines with hundreds of pages — place hub pages first so they're covered).
 * Modules without `sample` are walked in full.
 */
export type RegistryModule = {
  name: string;
  entries: PageEntry[];
  sample?: number;
};

/**
 * Every page-data module, in sitemap order. New engines (templateEntries,
 * showcaseEntries, modelEntries, competitorEntries, …) append here — that's the
 * only edit needed to fold an engine into the sitemap and smoke coverage.
 */
export const registryModules: RegistryModule[] = [
  { name: "static", entries: staticEntries },
  { name: "competitors", entries: competitorEntries },
];

/** Flat list of every page entry across all modules. */
export const registry: PageEntry[] = registryModules.flatMap((m) => m.entries);
