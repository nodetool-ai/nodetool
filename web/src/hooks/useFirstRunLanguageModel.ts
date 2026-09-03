/**
 * Give a brand-new account a working chat model.
 *
 * `GlobalChatStore` starts on an unsendable `{ provider: "empty" }`
 * placeholder, and the model menu highlights whatever sorts first, so the
 * first Enter used to commit an arbitrary model and persist it forever. This
 * hook fills the placeholder once from the recommended list — the curated
 * managed catalog first, then the server's `RECOMMENDED_MODELS` — restricted
 * to models this account can actually run.
 *
 * It never touches a model the user picked, and it waits for the model list
 * to load. When nothing recommended is available the placeholder stays, and
 * the composer keeps asking for a choice.
 */

import { useEffect, useRef } from "react";
import { isModelSelected } from "@nodetool-ai/protocol";
import useGlobalChatStore from "../stores/GlobalChatStore";
import type { LanguageModel } from "../stores/ApiTypes";
import { useLanguageModelsByProvider } from "./useModelsByProvider";
import { useModelAvailability } from "./useModelAvailability";
import {
  recommendedModelKey,
  useRecommendedModelKeys
} from "./useRecommendedModelKeys";

/**
 * The first model in `preferredKeys` that is present and available, or null.
 */
export const pickFirstRunModel = (
  models: readonly LanguageModel[],
  preferredKeys: readonly string[],
  isAvailable: (model: LanguageModel) => boolean
): LanguageModel | null => {
  const availableByKey = new Map<string, LanguageModel>();
  for (const model of models) {
    if (!isAvailable(model)) continue;
    const key = recommendedModelKey(model.provider, model.id);
    if (!availableByKey.has(key)) availableByKey.set(key, model);
  }
  for (const key of preferredKeys) {
    const match = availableByKey.get(key);
    if (match) return match;
  }
  return null;
};

export const useFirstRunLanguageModel = (): void => {
  const selectedModel = useGlobalChatStore((s) => s.selectedModel);
  const setSelectedModel = useGlobalChatStore((s) => s.setSelectedModel);
  const { models, isLoading } = useLanguageModelsByProvider();
  const getAvailability = useModelAvailability();
  const recommendedKeys = useRecommendedModelKeys();
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    if (isModelSelected(selectedModel)) return;
    if (isLoading || models.length === 0) return;

    const pick = pickFirstRunModel(
      models,
      recommendedKeys,
      (model) => getAvailability(model).available
    );
    if (!pick) return;

    applied.current = true;
    setSelectedModel({ ...pick, name: pick.name || pick.id });
  }, [
    selectedModel,
    models,
    isLoading,
    recommendedKeys,
    getAvailability,
    setSelectedModel
  ]);
};

export default useFirstRunLanguageModel;
