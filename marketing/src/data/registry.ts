import type { PageEntry } from "./types";
import { staticEntries } from "./staticEntries";
import { competitorEntries } from "./competitorEntries";
import { entries as modelEntries } from "./modelEntries";
import { entries as modelComparisonEntries } from "./modelComparisonEntries";
import { entries as providerEntries } from "./providerEntries";
import { faqPageEntries } from "./faqEntries";
import { ideasPageEntries } from "./ideasEntries";
import { templateEntries } from "./templates";
import { recipeEntries } from "./recipes";
import { miniAppEntries } from "./miniApps";
import { solutionRegistryEntries } from "./landingEntries";
import { taskRegistryEntries } from "./taskEntries";
import { showcasePageEntries } from "./showcasePages";
import { blogPageEntries } from "./blogEntries";

/**
 * A page engine's contribution to the registry. `sample`, when set, is a
 * hint for consumers that intentionally sample large engines. Static SEO
 * checks still walk every indexable route.
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
  { name: "providers", entries: providerEntries },
  { name: "faq", entries: faqPageEntries },
  { name: "ideas", entries: ideasPageEntries },
  { name: "templates", entries: templateEntries },
  { name: "recipes", entries: recipeEntries },
  { name: "apps", entries: miniAppEntries },
  { name: "solutions", entries: solutionRegistryEntries },
  { name: "tasks", entries: taskRegistryEntries },
  { name: "blog", entries: blogPageEntries },
  // Consumers that need a bounded interactive sample can use the first 12
  // showcase entries, with hub + filter pages ordered first.
  { name: "showcase", entries: showcasePageEntries, sample: 12 },
];

/** Flat list of every page entry across all modules. */
export const registry: PageEntry[] = registryModules.flatMap((m) => m.entries);
