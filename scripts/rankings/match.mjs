/**
 * Bridge an Artificial Analysis leaderboard row to a canonical model NodeTool
 * already knows about.
 *
 * The canonical vocabulary is not invented here: it is GenSpend's `model_slug`,
 * which the shipped price catalog
 * (`packages/model-pricing/src/generated/genspend-pricing.json`) records on
 * every priced route. A slug's routes are simply the catalog entries carrying
 * it, so expanding one canonical model to its `provider:model_id` keys costs no
 * new matching.
 *
 * Matching is exact-key only, through `modelKeys()` from the price sync's
 * `normalize.mjs` — the same comparison that decides whether `FLUX.2 [pro]` and
 * `flux-2-pro` are one model. Nothing is fuzzy-matched, nothing is
 * prefix-matched. A name that lands on two slugs is ambiguous and dropped; a
 * name that lands on none is unmatched. Both are reported, and
 * `scripts/rankings/aliases.json` is where a maintainer pins or blocks one by
 * hand.
 */

import { modelKeys } from "../genspend/normalize.mjs";

/**
 * The canonical slug universe and each slug's provider routes, read off the
 * shipped price catalog.
 *
 * `keys` maps one comparison key to the slugs that answer to it. A key
 * reaching more than one slug is what makes a row ambiguous — `flux-2` cannot
 * choose between `flux-2-pro` and `flux-2-flex`, and guessing would attach one
 * model's rank to another's route.
 */
export function buildSlugIndex(pricing) {
  const routesBySlug = new Map();
  for (const [key, entry] of Object.entries(pricing?.prices ?? {})) {
    const slug = typeof entry?.model_slug === "string" ? entry.model_slug : null;
    if (!slug) continue;
    const colon = key.indexOf(":");
    if (colon <= 0 || colon === key.length - 1) continue;
    const routes = routesBySlug.get(slug) ?? [];
    routes.push({ provider: key.slice(0, colon), modelId: key.slice(colon + 1) });
    routesBySlug.set(slug, routes);
  }

  const keys = new Map();
  for (const slug of routesBySlug.keys()) {
    for (const key of modelKeys(slug)) {
      if (!keys.has(key)) keys.set(key, new Set());
      keys.get(key).add(slug);
    }
  }

  for (const routes of routesBySlug.values()) {
    routes.sort((a, b) =>
      `${a.provider}:${a.modelId}`.localeCompare(`${b.provider}:${b.modelId}`)
    );
  }

  return { routesBySlug, keys };
}

/**
 * The alias entry pinned for a row, if any. Aliases are keyed by the AA slug
 * first and the display name second — the slug is stable, the name is what a
 * maintainer reads in the run report.
 *
 * Returns `undefined` when nothing is pinned, so a pinned `null` (a block)
 * stays distinguishable from an absent pin.
 */
export function aliasFor(row, aliases) {
  const models = aliases?.models ?? {};
  for (const candidate of [row?.slug, row?.name]) {
    if (typeof candidate === "string" && candidate in models) {
      return models[candidate];
    }
  }
  return undefined;
}

/**
 * Resolve one leaderboard row to a canonical slug.
 *
 * `{slug, match}` on success, where `match` is `alias` (a maintainer's call) or
 * `key` (the exact-key comparison). `{slug: null, reason}` otherwise, with
 * `reason` one of `blocked`, `alias-target-unknown`, `ambiguous`, `unmatched` —
 * every one of which lands in the run report rather than in the artifact.
 */
export function matchRow(row, index, aliases) {
  const pinned = aliasFor(row, aliases);
  if (pinned === null) return { slug: null, reason: "blocked" };
  if (typeof pinned === "string") {
    if (!index.routesBySlug.has(pinned)) {
      return { slug: null, reason: "alias-target-unknown", detail: pinned };
    }
    return { slug: pinned, match: "alias" };
  }

  const hits = new Set();
  for (const key of modelKeys(row?.slug, row?.name)) {
    for (const slug of index.keys.get(key) ?? []) hits.add(slug);
  }
  if (hits.size === 1) return { slug: [...hits][0], match: "key" };
  if (hits.size > 1) {
    return { slug: null, reason: "ambiguous", detail: [...hits].sort().join(", ") };
  }
  return { slug: null, reason: "unmatched" };
}
