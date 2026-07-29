/**
 * Query helpers that join `showcaseEntries` (and duel fixtures) to model pages.
 *
 * A model page shows the top showcase items for its model; a pair page shows
 * same-prompt duel pairs (from W-2, keyed by `params.duelId`). Both resolve a
 * showcase row's fine-grained `modelSlug` (e.g. `flux-dev`) back to a model page
 * slug (`flux`) via each model's `showcaseSlugs`.
 */
import { showcaseEntries, type ShowcaseEntry } from "./showcase";
import { modelEntries } from "./modelEntries";
import { duelFixtures } from "./showcaseDuelFixtures";

/** Resolve a showcase `modelSlug` to the model page slug it belongs to. */
export function modelSlugToPage(modelSlug: string): string | undefined {
  const lower = modelSlug.toLowerCase();
  for (const m of modelEntries) {
    if (m.showcaseSlugs.some((s) => s.toLowerCase() === lower)) return m.slug;
  }
  // Fall back to a hyphen-boundary prefix (page slug `flux` ← `flux-schnell`).
  for (const m of [...modelEntries].sort((x, y) => y.slug.length - x.slug.length)) {
    if (lower === m.slug || lower.startsWith(`${m.slug}-`)) return m.slug;
  }
  return undefined;
}

/** Showcase items for a model page, best first. */
export function showcaseForModel(slug: string): ShowcaseEntry[] {
  return showcaseEntries.filter((e) => modelSlugToPage(e.modelSlug) === slug);
}

/** Top N heroes for a model page (empty → the page uses its thumbnail fallback). */
export function heroShowcaseForModel(slug: string, limit = 3): ShowcaseEntry[] {
  return showcaseForModel(slug).slice(0, limit);
}

/** Additional prompt-example items beyond the heroes. */
export function promptExamplesForModel(
  slug: string,
  skip = 3,
  limit = 6
): ShowcaseEntry[] {
  return showcaseForModel(slug).slice(skip, skip + limit);
}

export interface DuelPair {
  duelId: string;
  prompt: string;
  /** Output for model `a`. */
  first: ShowcaseEntry;
  /** Output for model `b`. */
  second: ShowcaseEntry;
}

/**
 * Same-prompt pairs for a comparison `a` vs `b`. Prefers generated duel rows in
 * `showcaseEntries`; falls back to committed fixtures when a pair has none yet.
 */
export function duelPairsForComparison(a: string, b: string): DuelPair[] {
  const generated = matchDuels(
    showcaseEntries.filter((e) => e.params?.duelId),
    a,
    b
  );
  if (generated.length > 0) return generated;
  return matchDuels(duelFixtures, a, b);
}

function matchDuels(rows: ShowcaseEntry[], a: string, b: string): DuelPair[] {
  const byDuel = new Map<string, ShowcaseEntry[]>();
  for (const row of rows) {
    const id = row.params?.duelId;
    if (!id) continue;
    const list = byDuel.get(id) ?? [];
    list.push(row);
    byDuel.set(id, list);
  }

  const pairs: DuelPair[] = [];
  for (const [duelId, group] of byDuel) {
    const forA = group.find((r) => modelSlugToPage(r.modelSlug) === a);
    const forB = group.find((r) => modelSlugToPage(r.modelSlug) === b);
    if (forA && forB) {
      pairs.push({ duelId, prompt: forA.prompt, first: forA, second: forB });
    }
  }
  return pairs;
}
