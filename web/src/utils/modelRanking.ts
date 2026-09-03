import {
  rank,
  searchTermsFromQuery,
  type RankConfig,
  type RankField
} from "./ranking";
import type {
  EnabledProvidersMap,
  ModelSelectorModel
} from "../stores/ModelMenuStore";

const FIELD_WEIGHTS = {
  name: 6,
  id: 4,
  path: 4,
  provider: 2,
  tasks: 1
} as const;

const modelKey = (m: ModelSelectorModel): string =>
  `${m.provider ?? ""}:${m.id ?? ""}`;

const tasksAsText = (m: ModelSelectorModel): string | undefined =>
  m.supported_tasks && m.supported_tasks.length > 0
    ? m.supported_tasks.join(" ")
    : undefined;

const MODEL_FIELDS: ReadonlyArray<RankField<ModelSelectorModel>> = [
  { get: (m) => m.name, weight: FIELD_WEIGHTS.name },
  { get: (m) => m.id, weight: FIELD_WEIGHTS.id },
  { get: (m) => m.path ?? undefined, weight: FIELD_WEIGHTS.path },
  { get: (m) => m.provider, weight: FIELD_WEIGHTS.provider },
  { get: tasksAsText, weight: FIELD_WEIGHTS.tasks }
];

const isGeminiOrGoogle = (provider: string | undefined): boolean =>
  /gemini|google/i.test(provider || "");

/**
 * Provider matches the user-selected sidebar entry.
 * The "gemini" entry intentionally covers both gemini and google providers,
 * preserving prior behavior from filterModelsList().
 */
const providerMatches = (
  modelProvider: string | undefined,
  selected: string
): boolean => {
  if (isGeminiOrGoogle(selected)) return isGeminiOrGoogle(modelProvider);
  return modelProvider === selected;
};

const isProviderEnabled = (
  provider: string | undefined,
  enabled: EnabledProvidersMap | undefined
): boolean => {
  if (!enabled) return true;
  return enabled[provider ?? ""] !== false;
};

// Models come from the query cache and are never mutated, so keying by identity
// is safe. Without it the tie-break lower-cases two strings per comparison.
const displayNameCache = new WeakMap<ModelSelectorModel, string>();

const displayNameKey = (model: ModelSelectorModel): string => {
  const cached = displayNameCache.get(model);
  if (cached !== undefined) return cached;
  const key = (model.path || model.name || model.id || "").toLowerCase();
  displayNameCache.set(model, key);
  return key;
};

const compareByDisplayName = (
  a: ModelSelectorModel,
  b: ModelSelectorModel
): number => displayNameKey(a).localeCompare(displayNameKey(b));

interface ModelRankOptions {
  selectedProvider?: string | null;
  enabledProviders?: EnabledProvidersMap;
  /** Keys (`${provider}:${id}`) of recently used models, most-recent first. */
  recentKeys?: readonly string[];
  /** Keys (`${provider}:${id}`) of favorited models. */
  favoriteKeys?: Iterable<string>;
  /**
   * Keys (`${provider}:${id}`) of curated and recommended models, best first.
   *
   * Applied only when the query is empty, and only as a tie-break: favorites
   * and recents score above zero and keep their places, so this orders the
   * remainder. Without it an account with no history sees whatever sorts
   * first alphabetically, which is how a new user lands on the weakest model
   * in the catalog.
   */
  recommendedKeys?: readonly string[];
}

/** Tie-break that puts recommended models first, then display name. */
const compareByRecommendation = (
  order: ReadonlyMap<string, number>
): ((a: ModelSelectorModel, b: ModelSelectorModel) => number) => {
  return (a, b) => {
    const rankA = order.get(modelKey(a)) ?? Number.POSITIVE_INFINITY;
    const rankB = order.get(modelKey(b)) ?? Number.POSITIVE_INFINITY;
    if (rankA !== rankB) return rankA - rankB;
    return compareByDisplayName(a, b);
  };
};

export function rankModels<T extends ModelSelectorModel>(
  models: readonly T[] | undefined,
  searchTerm: string,
  options: ModelRankOptions = {}
): T[] {
  if (!models || models.length === 0) return [];

  const terms = searchTermsFromQuery(searchTerm);
  const {
    selectedProvider,
    enabledProviders,
    recentKeys,
    favoriteKeys,
    recommendedKeys
  } = options;

  const recommendedOrder = new Map<string, number>();
  if (terms.length === 0) {
    recommendedKeys?.forEach((key, index) => {
      if (!recommendedOrder.has(key)) recommendedOrder.set(key, index);
    });
  }

  const prefilter = (m: T): boolean => {
    // When a provider is explicitly selected, ignore enable/disable flags so
    // the user can still see models under a provider they've toggled off.
    if (selectedProvider) {
      return providerMatches(m.provider, selectedProvider);
    }
    return isProviderEnabled(m.provider, enabledProviders);
  };

  const config: RankConfig<T> = {
    fields: MODEL_FIELDS as ReadonlyArray<RankField<T>>,
    keyFn: modelKey,
    prefilter,
    recentKeys,
    boostedKeys: favoriteKeys,
    tieBreak:
      recommendedOrder.size > 0
        ? compareByRecommendation(recommendedOrder)
        : compareByDisplayName
  };

  const scored = rank<T>(models, terms, config);
  return scored.map(({ item }) => item);
}
