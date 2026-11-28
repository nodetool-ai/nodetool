/**
 * The preference order for an account's first language model.
 *
 * An account that saved no language-provider key of its own starts on a free
 * model. On NodeTool Cloud that is `nodetool/free`, the managed provider's
 * route to OpenRouter's free router on the platform key, so a new account gets
 * a working chat, storyboard and game designer without a key and without
 * spending anything. Elsewhere it is `openrouter/free` on the user's own
 * OpenRouter key. The ranked list would otherwise put a paid model first.
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

/** NodeTool Cloud's managed free model, routed through OpenRouter. */
export const MANAGED_FREE_TEXT_MODEL_KEY = recommendedModelKey(
  PROVIDER_IDS.NODETOOL,
  "nodetool/free"
);

/** OpenRouter's router over its free models. */
export const FREE_TEXT_MODEL_KEY = recommendedModelKey(
  PROVIDER_IDS.OPENROUTER,
  "openrouter/free"
);

/** Free models in preference order. A server lists only the ones it serves. */
export const FREE_TEXT_MODEL_KEYS = [
  MANAGED_FREE_TEXT_MODEL_KEY,
  FREE_TEXT_MODEL_KEY
] as const;

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

/** `recommended`, led by the free models when the user has no key. */
export const defaultLanguageModelKeys = (
  recommended: readonly string[],
  ownKey: boolean
): string[] => {
  if (ownKey) {
    return [...recommended];
  }
  const free: readonly string[] = FREE_TEXT_MODEL_KEYS;
  return [...free, ...recommended.filter((key) => !free.includes(key))];
};

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
