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
  /**
   * When a query matches nothing literally, score it again ignoring the
   * separators between words and allowing a subsequence. Off by default: it
   * changes an empty result into a ranked guess, which is right for a picker
   * over thousands of machine-named models and wrong where an empty result is
   * the answer.
   */
  fuzzyFallback?: boolean;
}

interface Scored<T> {
  item: T;
  score: number;
}

const DEFAULT_EXACT_TOKEN_BONUS = 2;
/**
 * How much of a field's weight a loose match is worth. Both are below 1, so a
 * fuzzy hit can never outrank a literal one — and the fuzzy pass only runs
 * when the literal pass found nothing at all, so ordinary queries are scored
 * exactly as before.
 */
const SQUASHED_MATCH_WEIGHT = 0.6;
const SUBSEQUENCE_MATCH_WEIGHT = 0.3;
/** Below this a subsequence match is noise: "ai" is inside half the catalog. */
const MIN_SUBSEQUENCE_TERM_LENGTH = 4;
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

/** Drops the separators that split one model's name from another's id. */
const squash = (value: string): string =>
  value.toLowerCase().replace(/[\s._\-/]+/g, "");

/** True when every character of `term` appears in `text`, in order. */
const isSubsequence = (text: string, term: string): boolean => {
  let index = 0;
  for (const char of text) {
    if (char === term[index]) {
      index += 1;
      if (index === term.length) return true;
    }
  }
  return false;
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

// `lowerTerms` arrive lower-cased from `rank`. Scoring is field-major so a long
// field (a node's description) is lower-cased once per item, not once per term.
function fieldScore(
  field: string | undefined,
  lowerTerms: readonly string[],
  weight: number,
  exactTokenBonus: number
): number {
  if (!field) return 0;
  const lower = field.toLowerCase();

  let score = 0;
  let tokens: string[] | null = null;
  for (const term of lowerTerms) {
    if (!lower.includes(term)) continue;
    score += weight;
    if (tokens === null) {
      tokens = lower.split(/[\s._\-/]+/).filter(Boolean);
    }
    if (tokens.includes(term)) {
      score += weight * exactTokenBonus;
    }
  }
  return score;
}

/**
 * The second pass. A model's name is written for a reader ("Minimax H3Max
 * Turbo Image To Video") while its id is written for a machine
 * ("minimax/h3-max-turbo/image-to-video"), so a creator typing what they
 * remember — "h3maxturbo", "h3 max turbo pro" — can match neither. Squashing
 * the separators out of both sides catches the first case; a subsequence
 * catches an abbreviation or a dropped character.
 */
function looseFieldScore(
  field: string | undefined,
  lowerTerms: readonly string[],
  weight: number
): number {
  if (!field) return 0;
  const squashed = squash(field);
  if (squashed.length === 0) return 0;

  let score = 0;
  for (const term of lowerTerms) {
    const squashedTerm = squash(term);
    if (squashedTerm.length === 0) continue;
    if (squashed.includes(squashedTerm)) {
      score += weight * SQUASHED_MATCH_WEIGHT;
      continue;
    }
    if (
      squashedTerm.length >= MIN_SUBSEQUENCE_TERM_LENGTH &&
      isSubsequence(squashed, squashedTerm)
    ) {
      score += weight * SUBSEQUENCE_MATCH_WEIGHT;
    }
  }
  return score;
}

function scoreItem<T>(
  item: T,
  lowerTerms: readonly string[],
  config: RankConfig<T>,
  loose = false
): number {
  if (lowerTerms.length === 0) return 0;

  const exactBonus = config.exactTokenBonus ?? DEFAULT_EXACT_TOKEN_BONUS;

  let raw = 0;
  for (const field of config.fields) {
    raw += loose
      ? looseFieldScore(field.get(item), lowerTerms, field.weight)
      : fieldScore(field.get(item), lowerTerms, field.weight, exactBonus);
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
  const strict = rankPass(items, terms, config, false);
  if (strict.length > 0 || config.fuzzyFallback !== true) {
    return strict;
  }
  return rankPass(items, terms, config, true);
}

function rankPass<T>(
  items: readonly T[],
  terms: readonly string[],
  config: RankConfig<T>,
  loose: boolean
): Scored<T>[] {
  const recentRank = new Map<string, number>();
  config.recentKeys?.forEach((key, index) => recentRank.set(key, index));
  const boostedKeys = new Set<string>(config.boostedKeys ?? []);
  const recentBonus = config.recentBonus ?? DEFAULT_RECENT_BONUS;
  const boostedBonus = config.boostedBonus ?? DEFAULT_BOOSTED_BONUS;

  const hasTerms = terms.some((term) => term.trim().length > 0);
  const lowerTerms = terms
    .map((term) => term.toLowerCase())
    .filter((term) => term.length > 0);
  const scored: Scored<T>[] = [];

  for (const item of items) {
    if (config.prefilter && !config.prefilter(item)) continue;

    const key = config.keyFn(item);
    const candidateBoost = getCandidateBoost(config.candidateBoosts, key);
    const baseScore = hasTerms ? scoreItem(item, lowerTerms, config, loose) : 0;
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
