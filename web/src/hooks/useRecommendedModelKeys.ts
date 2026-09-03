/**
 * The models NodeTool suggests when the user has expressed no preference.
 *
 * Two sources, in order:
 * 1. `NODETOOL_MODELS` — the curated managed catalog, served on platform keys.
 * 2. `models.recommended` — the server's `RECOMMENDED_MODELS` list. The web app
 *    reads it over tRPC because that list lives in `@nodetool-ai/runtime`,
 *    which the frontend does not import.
 *
 * The model menu uses the keys to order an empty query, and the first-run
 * default picks the first entry the account can actually use.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { NODETOOL_MODELS, NODETOOL_PROVIDER_ID } from "@nodetool-ai/protocol";
import { trpc } from "../lib/trpc";
import type { UnifiedModel } from "../stores/ApiTypes";

/** The key both the ranker and the model preferences store select on. */
export const recommendedModelKey = (
  provider: string | undefined | null,
  id: string | undefined | null
): string => `${provider ?? ""}:${id ?? ""}`;

const CURATED_KEYS: readonly string[] = NODETOOL_MODELS.map((model) =>
  recommendedModelKey(NODETOOL_PROVIDER_ID, model.id)
);

const RECOMMENDED_STALE_TIME = 5 * 60 * 1000;

const EMPTY_MODELS: UnifiedModel[] = [];

export const useRecommendedModels = (): UnifiedModel[] => {
  const { data } = useQuery<UnifiedModel[]>({
    queryKey: ["recommended-models"],
    queryFn: () => trpc.models.recommended.query({ check_servers: false }),
    staleTime: RECOMMENDED_STALE_TIME,
    refetchOnWindowFocus: false
  });
  return data ?? EMPTY_MODELS;
};

/**
 * Keys of the recommended models, best first: the curated managed catalog,
 * then the server's recommended list.
 */
export const useRecommendedModelKeys = (): string[] => {
  const recommended = useRecommendedModels();
  return useMemo(
    () => [
      ...CURATED_KEYS,
      ...recommended.map((model) =>
        recommendedModelKey(model.provider, model.id)
      )
    ],
    [recommended]
  );
};

export default useRecommendedModelKeys;
