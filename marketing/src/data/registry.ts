import type { PageEntry } from "./types";
import { staticEntries } from "./staticEntries";
import { competitorEntries } from "./competitorEntries";
import { entries as modelEntries } from "./modelEntries";
import { entries as modelComparisonEntries } from "./modelComparisonEntries";
import { faqPageEntries } from "./faqEntries";
import { ideasPageEntries } from "./ideasEntries";
import { templateEntries } from "./templates";
import { solutionRegistryEntries } from "./landingEntries";
import { taskRegistryEntries } from "./taskEntries";
import { showcasePageEntries } from "./showcasePages";

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
  { name: "models", entries: modelEntries },
  { name: "model-comparisons", entries: modelComparisonEntries },
  { name: "faq", entries: faqPageEntries },
  { name: "ideas", entries: ideasPageEntries },
  { name: "templates", entries: templateEntries },
  { name: "solutions", entries: solutionRegistryEntries },
  { name: "tasks", entries: taskRegistryEntries },
  // Showcase pages can grow into the hundreds once W-1 seeds real batches, so
  // the smoke suite samples the first 12 — hub + filter pages are ordered first.
  { name: "showcase", entries: showcasePageEntries, sample: 12 },
];

/** Flat list of every page entry across all modules. */
export const registry: PageEntry[] = registryModules.flatMap((m) => m.entries);
