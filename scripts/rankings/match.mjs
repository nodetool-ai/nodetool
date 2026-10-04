/**
 * Bridge an Artificial Analysis leaderboard row to the provider routes that
 * serve that model.
 *
 * The route universe is what NodeTool's own providers list
 * (`scripts/rankings/routes.mjs`): every `<provider>:<model_id>` a user can
 * select. The canonical id is the leaderboard's own `slug`, so no outside
 * catalog names the models and a model needs nothing but a provider route to be
 * ranked.
 *
 * Matching is exact-key only, through `modelKeys()` (`./model-keys.mjs`) — the
 * same comparison that decides whether `FLUX.2 [pro]` and `flux-2-pro` are one
 * model. Nothing is fuzzy-matched, nothing is prefix-matched. A row that
 * reaches no route is unmatched, a route two different rows both reach is
 * ambiguous, and both are reported (never guessed).
 * `scripts/rankings/aliases.json` is where a maintainer pins or blocks one by
 * hand.
 *
 * A route that declares the tasks it serves is matched only for a leaderboard
 * of one of those tasks — pinned routes included. Without that,
 * `fal-ai/flux-2/pro/edit` (whose task-stripped key is `flux-2-pro`) would take
 * the text-to-image rank of `FLUX.2 [pro]`.
 */

import { modelKeys } from "./model-keys.mjs";

/** `<provider>:<model_id>` — the key a route has in the artifact. */
export function routeKeyOf(route) {
  return `${route.provider}:${route.modelId}`;
}

/**
 * Index the route universe.
 *
 * `routes` maps a route key to its entry. `keys` maps one comparison key to the
 * route keys that answer to it: an id and a display name both feed it, so a
 * model listed as `fal-ai/flux-2/pro` named "FLUX.2 Pro" is findable under
 * either spelling. A key reaching several routes is normal (every provider's
 * copy of one model); a route reached by several *rows* is what makes a row
 * ambiguous.
 */
export function buildRouteIndex(entries) {
  const routes = new Map();
  const keys = new Map();
  for (const entry of entries ?? []) {
    if (!entry?.provider || !entry?.modelId) continue;
    const key = routeKeyOf(entry);
    if (routes.has(key)) continue;
    routes.set(key, entry);
    for (const comparison of modelKeys(entry.modelId, entry.name)) {
      if (!keys.has(comparison)) keys.set(comparison, new Set());
      keys.get(comparison).add(key);
    }
  }
  return { routes, keys };
}

/** Does this route serve `task`? A route that declares no tasks is never filtered out. */
function servesTask(route, task) {
  const tasks = route.tasks;
  return !Array.isArray(tasks) || tasks.length === 0 || tasks.includes(task);
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
 * Resolve one leaderboard row to the provider routes that serve it.
 *
 * `{routes, match}` on success, where `match` is `alias` (a maintainer's call)
 * or `key` (the exact-key comparison), and `routes` is a sorted list of route
 * keys. `{routes: [], reason}` otherwise, with `reason` one of `blocked`,
 * `alias-target-unknown`, `unmatched` — every one of which lands in the run
 * report rather than in the artifact.
 *
 * An alias value is a route key or a list of them. A pin chooses the model, not
 * the task: a pinned route is still served only for a task it declares.
 */
export function matchRow(row, index, aliases, task) {
  const pinned = aliasFor(row, aliases);
  if (pinned === null) return { routes: [], reason: "blocked" };
  if (typeof pinned === "string" || Array.isArray(pinned)) {
    const targets = [pinned].flat().filter((t) => typeof t === "string");
    const unknown = targets.filter((t) => !index.routes.has(t));
    if (targets.length === 0 || unknown.length > 0) {
      return {
        routes: [],
        reason: "alias-target-unknown",
        detail: (unknown.length > 0 ? unknown : [String(pinned)]).join(", ")
      };
    }
    const served = [...new Set(targets)]
      .filter((t) => servesTask(index.routes.get(t), task))
      .sort();
    if (served.length === 0) {
      return {
        routes: [],
        reason: "unmatched",
        detail: `pinned routes do not serve ${task}`
      };
    }
    return { routes: served, match: "alias" };
  }

  const hits = new Set();
  for (const key of modelKeys(row?.slug, row?.name)) {
    for (const routeKey of index.keys.get(key) ?? []) {
      if (servesTask(index.routes.get(routeKey), task)) hits.add(routeKey);
    }
  }
  if (hits.size === 0) return { routes: [], reason: "unmatched" };
  return { routes: [...hits].sort(), match: "key" };
}
