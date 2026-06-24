/**
 * Generic ranker. Powers both the node menu and the model menu.
 *
 *   score = base(field weights + exact-token bonus) * multiplier
 *         + candidateBoost
 *         + recentBonus
 *         + boostedBonus
 *
 * Domain-specific behavior (which fields, which namespaces get a multiplier,
 * which items are filtered out before scoring) is supplied by the caller via
 * RankConfig — the ranker itself knows nothing about nodes or models.
 */

export interface RankField<T> {
  get: (item: T) => string | undefined;
  weight: number;
}

export interface RankConfig<T> {
  fields: ReadonlyArray<RankField<T>>;
  keyFn: (item: T) => string;
  /** Bonus multiplier applied when a search token matches a whole subtoken. */
  exactTokenBonus?: number;
  /** Per-item score multiplier (e.g. core-namespace boost for nodes). */
  multiplier?: (item: T) => number;
  /** Drop items that fail this check before any scoring. */
  prefilter?: (item: T) => boolean;
  /** Keys (as produced by keyFn) of recently used items, most-recent first. */
  recentKeys?: readonly string[];
  recentBonus?: number;
  /** Keys (as produced by keyFn) of curated/boosted items. */
  boostedKeys?: Iterable<string>;
  boostedBonus?: number;
  /** Pre-computed per-key boosts (from a secondary search index, etc.). */
  candidateBoosts?: ReadonlyMap<string, number> | Record<string, number>;
  /** Keep items that have a candidate boost but no field match. */
  includeCandidateOnlyMatches?: boolean;
  /** Tie-break when scores are equal. Defaults to lexicographic keyFn order. */
  tieBreak?: (a: T, b: T) => number;
}

interface Scored<T> {
  item: T;
  score: number;
}

const DEFAULT_EXACT_TOKEN_BONUS = 2;
const DEFAULT_RECENT_BONUS = 10;
const DEFAULT_BOOSTED_BONUS = 6;

const isReadonlyMap = (
  value: ReadonlyMap<string, number> | Record<string, number>
): value is ReadonlyMap<string, number> =>
  "get" in value && typeof value.get === "function";

const getCandidateBoost = (
  source: ReadonlyMap<string, number> | Record<string, number> | undefined,
  key: string
): number => {
  if (!source) return 0;
  return isReadonlyMap(source) ? source.get(key) ?? 0 : source[key] ?? 0;
};

export function searchTermsFromQuery(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const terms = new Set<string>([trimmed]);
  trimmed
    .split(/[\s,]+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .forEach((term) => terms.add(term));
  return Array.from(terms);
}

function fieldScore(
  field: string | undefined,
  term: string,
  weight: number,
  exactTokenBonus: number
): number {
  if (!field) return 0;
  const lower = field.toLowerCase();
  if (!lower.includes(term)) return 0;

  let score = weight;
  const tokens = lower.split(/[\s._\-/]+/).filter(Boolean);
  if (tokens.includes(term)) {
    score += weight * exactTokenBonus;
  }
  return score;
}

export function scoreItem<T>(
  item: T,
  terms: readonly string[],
  config: RankConfig<T>
): number {
  if (terms.length === 0) return 0;
  if (config.prefilter && !config.prefilter(item)) return 0;

  const exactBonus = config.exactTokenBonus ?? DEFAULT_EXACT_TOKEN_BONUS;

  let raw = 0;
  for (const rawTerm of terms) {
    const term = rawTerm.toLowerCase();
    if (!term) continue;
    for (const field of config.fields) {
      raw += fieldScore(field.get(item), term, field.weight, exactBonus);
    }
  }

  if (raw === 0) return 0;
  const multiplier = config.multiplier ? config.multiplier(item) : 1;
  return raw * multiplier;
}

export function rank<T>(
  items: readonly T[],
  terms: readonly string[],
  config: RankConfig<T>
): Scored<T>[] {
  const recentRank = new Map<string, number>();
  config.recentKeys?.forEach((key, index) => recentRank.set(key, index));
  const boostedKeys = new Set<string>(config.boostedKeys ?? []);
  const recentBonus = config.recentBonus ?? DEFAULT_RECENT_BONUS;
  const boostedBonus = config.boostedBonus ?? DEFAULT_BOOSTED_BONUS;

  const hasTerms = terms.some((term) => term.trim().length > 0);
  const scored: Scored<T>[] = [];

  for (const item of items) {
    if (config.prefilter && !config.prefilter(item)) continue;

    const key = config.keyFn(item);
    const candidateBoost = getCandidateBoost(config.candidateBoosts, key);
    const baseScore = hasTerms ? scoreItem(item, terms, config) : 0;
    const matchedByCandidateOnly =
      config.includeCandidateOnlyMatches === true && candidateBoost > 0;

    if (hasTerms && baseScore === 0 && !matchedByCandidateOnly) continue;

    const recentIndex = recentRank.get(key);
    const recencyBoost =
      recentIndex === undefined ? 0 : recentBonus / (recentIndex + 1);
    const curatedBoost = boostedKeys.has(key) ? boostedBonus : 0;

    scored.push({
      item,
      score: baseScore + candidateBoost + recencyBoost + curatedBoost
    });
  }

  const tieBreak =
    config.tieBreak ??
    ((a: T, b: T) => config.keyFn(a).localeCompare(config.keyFn(b)));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return tieBreak(a.item, b.item);
  });
  return scored;
}
