/**
 * The preference order for an account's first language model.
 *
 * An account that saved no language-provider key of its own starts on
 * OpenRouter's free router, `openrouter/free`. On NodeTool Cloud the server's
 * OpenRouter key serves it, so a new account gets a working chat, storyboard
 * and game designer without a key and without spending anything. The ranked
 * list would otherwise put a paid model first, and on a server key that model
 * is billed to the operator.
 *
 * An account with a key of its own keeps the recommended order, so the first
 * pick runs on that key.
 */

import { useMemo } from "react";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import type { LanguageModel, SecretResponse } from "../stores/ApiTypes";
import { requiredSecretForProvider } from "../stores/ModelMenuStore";
import { useLanguageModelsByProvider } from "./useModelsByProvider";
import {
  recommendedModelKey,
  useRecommendedModelKeys
} from "./useRecommendedModelKeys";
import { useSecrets } from "./useSecrets";

/** OpenRouter's router over its free models. */
export const FREE_TEXT_MODEL_KEY = recommendedModelKey(
  PROVIDER_IDS.OPENROUTER,
  "openrouter/free"
);

/**
 * Whether the user saved a key for any provider in `models`. A key that only
 * the server's environment supplies does not count. A server too old to say
 * where a key came from reports no `source`, and that key counts as the
 * user's, which keeps the previous order there.
 */
export const hasOwnLanguageKey = (
  models: readonly Pick<LanguageModel, "provider">[],
  secrets: readonly SecretResponse[]
): boolean => {
  const own = new Set(
    secrets
      .filter((s) => s.is_configured && s.source !== "server")
      .map((s) => s.key)
  );
  return models.some((model) => {
    const key = requiredSecretForProvider(model.provider);
    return key !== null && own.has(key);
  });
};

/** `recommended`, led by the free router when the user has no key. */
export const defaultLanguageModelKeys = (
  recommended: readonly string[],
  ownKey: boolean
): string[] =>
  ownKey
    ? [...recommended]
    : [
        FREE_TEXT_MODEL_KEY,
        ...recommended.filter((key) => key !== FREE_TEXT_MODEL_KEY)
      ];

export const useDefaultLanguageModelKeys = (): string[] => {
  const recommended = useRecommendedModelKeys();
  const { models } = useLanguageModelsByProvider();
  const { secrets } = useSecrets();
  const ownKey = useMemo(
    () => hasOwnLanguageKey(models, secrets),
    [models, secrets]
  );
  return useMemo(
    () => defaultLanguageModelKeys(recommended, ownKey),
    [recommended, ownKey]
  );
};

export default useDefaultLanguageModelKeys;
