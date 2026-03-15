/**
 * Local Model Fit — Ranking
 *
 * Accepts a model catalog + hardware profile, scores every variant of
 * every model, and returns a flat sorted array of `RankedModelFit`.
 *
 * Consumers: hooks, UI components, model menus.
 */

import type { HardwareProfile, ModelCatalogEntry, RankedModelFit } from "./types";
import { scoreModelFit } from "./scoreModelFit";

/**
 * Score and rank every variant of every catalog entry against a hardware
 * profile.  Results are sorted by score descending (best fit first).
 */
export const rankModelFits = (
  catalog: readonly ModelCatalogEntry[],
  hw: HardwareProfile,
): RankedModelFit[] => {
  const results: RankedModelFit[] = [];

  for (const entry of catalog) {
    for (const variant of entry.variants) {
      results.push(scoreModelFit(hw, entry, variant));
    }
  }

  // Sort descending by score, then alphabetically by name for ties.
  results.sort((a, b) => {
    if (b.score !== a.score) { return b.score - a.score; }
    return a.name.localeCompare(b.name);
  });

  return results;
};
