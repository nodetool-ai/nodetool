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

const compareByDisplayName = (
  a: ModelSelectorModel,
  b: ModelSelectorModel
): number => {
  const an = (a.path || a.name || a.id || "").toLowerCase();
  const bn = (b.path || b.name || b.id || "").toLowerCase();
  return an.localeCompare(bn);
};

export interface ModelRankOptions {
  selectedProvider?: string | null;
  enabledProviders?: EnabledProvidersMap;
  /** Keys (`${provider}:${id}`) of recently used models, most-recent first. */
  recentKeys?: readonly string[];
  /** Keys (`${provider}:${id}`) of favorited models. */
  favoriteKeys?: Iterable<string>;
}

export function rankModels<T extends ModelSelectorModel>(
  models: readonly T[] | undefined,
  searchTerm: string,
  options: ModelRankOptions = {}
): T[] {
  if (!models || models.length === 0) return [];

  const terms = searchTermsFromQuery(searchTerm);
  const { selectedProvider, enabledProviders, recentKeys, favoriteKeys } =
    options;

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
    tieBreak: compareByDisplayName
  };

  const scored = rank<T>(models, terms, config);
  return scored.map(({ item }) => item);
}
