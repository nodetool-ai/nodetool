/**
 * Local Model Fit — Filtering
 *
 * Pure functions that narrow a `RankedModelFit[]` by search text, tags,
 * families, tiers, and the `fits` boolean.  These are composable — the
 * UI can chain them in any order.
 */

import type { RankedModelFit, FitTier } from "./types";

/**
 * Whether a single token matches a row. Tags need length ≥3 for prefix match
 * (avoids "e" matching everything). Description only when token length ≥4.
 */
const rowMatchesSearchToken = (r: RankedModelFit, token: string): boolean => {
  const t = token.toLowerCase();
  if (r.name.toLowerCase().includes(t)) {
    return true;
  }
  if (r.family.toLowerCase().includes(t)) {
    return true;
  }
  if (r.provider.toLowerCase().includes(t)) {
    return true;
  }
  const tagHit = r.tags.some((tag) => {
    const lt = tag.toLowerCase();
    return lt === t || (t.length >= 3 && lt.startsWith(t));
  });
  if (tagHit) {
    return true;
  }
  if (t.length >= 4) {
    const desc = (r.description ?? "").toLowerCase();
    if (desc.includes(t)) {
      return true;
    }
  }
  return false;
};

/**
 * Whitespace-separated tokens; each token must match (AND). Tokens shorter than
 * 2 characters are ignored so single-letter typing does not flood results.
 */
export const filterBySearch = (
  results: readonly RankedModelFit[],
  query: string,
): RankedModelFit[] => {
  const trimmed = query.trim();
  if (!trimmed) {
    return [...results];
  }
  const tokens = trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  if (tokens.length === 0) {
    return [...results];
  }
  return results.filter((r) => tokens.every((tok) => rowMatchesSearchToken(r, tok)));
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
