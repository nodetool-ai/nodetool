/**
 * Local Model Fit — Filtering
 *
 * Pure functions that narrow a `RankedModelFit[]` by search text, tags,
 * families, tiers, and the `fits` boolean.  These are composable — the
 * UI can chain them in any order.
 */

import type { RankedModelFit, FitTier } from "./types";

/** Case-insensitive text search across name, family, provider, description. */
export const filterBySearch = (
  results: readonly RankedModelFit[],
  query: string,
): RankedModelFit[] => {
  if (!query.trim()) { return [...results]; }
  const q = query.toLowerCase();
  return results.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.family.toLowerCase().includes(q) ||
      r.provider.toLowerCase().includes(q) ||
      (r.description ?? "").toLowerCase().includes(q) ||
      r.tags.some((t) => t.toLowerCase().includes(q))
  );
};

/** Keep only entries that have at least one of the given tags. */
export const filterByTags = (
  results: readonly RankedModelFit[],
  tags: readonly string[],
): RankedModelFit[] => {
  if (tags.length === 0) { return [...results]; }
  const set = new Set(tags.map((t) => t.toLowerCase()));
  return results.filter((r) =>
    r.tags.some((t) => set.has(t.toLowerCase()))
  );
};

/** Keep only entries that belong to one of the given families. */
export const filterByFamilies = (
  results: readonly RankedModelFit[],
  families: readonly string[],
): RankedModelFit[] => {
  if (families.length === 0) { return [...results]; }
  const set = new Set(families.map((f) => f.toLowerCase()));
  return results.filter((r) => set.has(r.family.toLowerCase()));
};

/** Keep only entries in the given tier set. */
export const filterByTiers = (
  results: readonly RankedModelFit[],
  tiers: readonly FitTier[],
): RankedModelFit[] => {
  if (tiers.length === 0) { return [...results]; }
  const set = new Set<FitTier>(tiers);
  return results.filter((r) => set.has(r.tier));
};

/** Keep only entries that fit (or don't). */
export const filterByFits = (
  results: readonly RankedModelFit[],
  fitsOnly: boolean,
): RankedModelFit[] => {
  if (!fitsOnly) { return [...results]; }
  return results.filter((r) => r.fits);
};
