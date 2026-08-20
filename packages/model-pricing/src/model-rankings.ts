/**
 * Quality rankings for media models, shipped as a generated snapshot and read
 * through a synchronous lookup — the same pattern as the GenSpend price
 * catalog next door (`genspend-catalog.ts`): no network, no key, no startup
 * fetch, and a week-stale answer in preference to none.
 *
 * The artifact is keyed `<provider_id>:<model_id>`, so one lookup answers for
 * the exact route a node has selected. Every route to one model carries the
 * same `canonical` id and identical `tasks` — quality is a property of the
 * model, never of the route the run happens to take. Grouping and the per-task
 * leaderboards are derived from that key space here rather than stored twice.
 *
 * Everything fails toward today's behavior: a model absent from the artifact
 * is unranked, never hidden and never down-ranked. Each accessor is total —
 * `null` or `[]`, never a throw.
 *
 * Rankings via artificialanalysis.ai.
 */

import rankings from "./generated/model-rankings.json" with { type: "json" };

/**
 * One model's standing in one task's leaderboard. `score` is the
 * source-native number (arena-style rating); `normalized` is its 0–1 position
 * within that leaderboard; `rank`/`of` are for display. No composite across
 * tasks: a model mediocre at text-to-image can lead at editing.
 */
export interface TaskRank {
  score: number;
  normalized: number;
  rank: number;
  of: number;
}

/**
 * What the artifact records for one provider route. `tasks` is keyed by
 * NodeTool's own `supportedTasks` vocabulary (`text_to_image`,
 * `image_to_video`, `text_to_speech`, …) and stays an open string key: the
 * vocabulary grows in `@nodetool-ai/protocol`, and a task this snapshot
 * predates must read as "unranked", not as a type error.
 */
export interface RankedModelEntry {
  /** GenSpend's `model_slug` — the id that groups routes to one model. */
  canonical: string;
  name: string;
  creator?: string;
  tasks: Record<string, TaskRank>;
}

export interface ModelRankingsArtifact {
  schemaVersion: number;
  source: string;
  /** null until the first real sync writes a snapshot. */
  generatedAt: string | null;
  /** Keyed `<provider_id>:<model_id>`, expanded at sync time. */
  models: Record<string, RankedModelEntry>;
}

/** One provider route to a model: the two halves of an artifact key. */
export interface ModelRoute {
  provider: string;
  modelId: string;
}

/** A route together with what the artifact records for it. */
export interface RankedRoute extends ModelRoute {
  entry: RankedModelEntry;
}

/** One row of a task leaderboard: one canonical model, all its routes. */
export interface RankedTaskEntry {
  canonical: string;
  name: string;
  rank: number;
  of: number;
  normalized: number;
  score: number;
  routes: ModelRoute[];
}

/**
 * The artifact's key space turned into the two groupings the accessors need.
 * Pure — `buildRankingsIndex` is what tests drive with a fixture, so nothing
 * here needs the shipped file mocked out.
 */
export interface RankingsIndex {
  artifact: ModelRankingsArtifact;
  /** Every route carrying a canonical id, in artifact key order. */
  routesByCanonical: Map<string, RankedRoute[]>;
  /** Per task, one row per canonical model, sorted by rank ascending. */
  rankedByTask: Map<string, RankedTaskEntry[]>;
}

export const modelRankings =
  // SAFETY: `rankings` is the generated `model-rankings.json` shipped in this
  // package, written by the model-rankings sync to exactly this shape. The
  // shipped empty artifact infers `models: {}` and `generatedAt: null`, which
  // do not match the declared interface structurally.
  rankings as ModelRankingsArtifact;

/** Split an artifact key at its first colon; provider ids carry none. */
function parseKey(key: string): ModelRoute | null {
  const colon = key.indexOf(":");
  if (colon <= 0 || colon === key.length - 1) return null;
  return { provider: key.slice(0, colon), modelId: key.slice(colon + 1) };
}

/**
 * Group an artifact by canonical id and by task. Called once per artifact and
 * cached below; exported so a test can index a fixture directly.
 */
export function buildRankingsIndex(
  artifact: ModelRankingsArtifact
): RankingsIndex {
  const routesByCanonical = new Map<string, RankedRoute[]>();
  const rankedByTask = new Map<string, RankedTaskEntry[]>();

  for (const [key, entry] of Object.entries(artifact.models ?? {})) {
    const route = parseKey(key);
    if (!route || !entry?.canonical) continue;

    const routes = routesByCanonical.get(entry.canonical) ?? [];
    routes.push({ ...route, entry });
    routesByCanonical.set(entry.canonical, routes);
  }

  // One row per canonical model, not per route: the routes of a canonical id
  // carry identical tasks, so the first one's entry names the leaderboard
  // position and the rest are listed as alternates on the same row.
  for (const [canonical, routes] of routesByCanonical) {
    const entry = routes[0].entry;
    const plainRoutes = routes.map(({ provider, modelId }) => ({
      provider,
      modelId
    }));
    for (const [task, rank] of Object.entries(entry.tasks ?? {})) {
      const rows = rankedByTask.get(task) ?? [];
      rows.push({
        canonical,
        name: entry.name,
        rank: rank.rank,
        of: rank.of,
        normalized: rank.normalized,
        score: rank.score,
        routes: plainRoutes
      });
      rankedByTask.set(task, rows);
    }
  }

  for (const rows of rankedByTask.values()) {
    rows.sort((a, b) => a.rank - b.rank);
  }

  return { artifact, routesByCanonical, rankedByTask };
}

const indexCache = new WeakMap<ModelRankingsArtifact, RankingsIndex>();

/** The index for an artifact, built once and reused. */
function indexFor(artifact: ModelRankingsArtifact): RankingsIndex {
  const cached = indexCache.get(artifact);
  if (cached) return cached;
  const built = buildRankingsIndex(artifact);
  indexCache.set(artifact, built);
  return built;
}

/**
 * What the artifact records for one provider route, or null when the model is
 * not ranked. Same shape of lookup as `getGenspendPrice`.
 */
export function getModelRank(
  provider: string | null,
  modelId: string,
  artifact: ModelRankingsArtifact = modelRankings
): RankedModelEntry | null {
  if (!provider) return null;
  return artifact.models?.[`${provider}:${modelId}`] ?? null;
}

/** The canonical id grouping this route with its siblings, or null. */
export function getCanonicalId(
  provider: string | null,
  modelId: string,
  artifact: ModelRankingsArtifact = modelRankings
): string | null {
  return getModelRank(provider, modelId, artifact)?.canonical ?? null;
}

/** Every provider route to one canonical model; `[]` when it has none. */
export function routesFor(
  canonicalId: string,
  artifact: ModelRankingsArtifact = modelRankings
): RankedRoute[] {
  return indexFor(artifact).routesByCanonical.get(canonicalId) ?? [];
}

/**
 * One task's leaderboard — one row per canonical model, best rank first.
 * `[]` for a task nothing in the artifact is ranked for.
 */
export function rankedForTask(
  task: string,
  artifact: ModelRankingsArtifact = modelRankings
): RankedTaskEntry[] {
  return indexFor(artifact).rankedByTask.get(task) ?? [];
}

export default modelRankings;
