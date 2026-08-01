/**
 * Hooks for fetching models by provider, mirroring the web's useModelsByProvider.
 *
 * Fetches providers with the relevant capability, then fans out to one
 * `*ByProvider` query per provider via `trpc.useQueries`. Results are flattened
 * and sorted into a single array. All requests go through tRPC + React Query so
 * results are cached and shared across the app.
 */

import { useCallback, useMemo, useRef } from "react";
import { trpc } from "../trpc/client";
import { normalizeModels } from "../services/api";
import type { ProviderInfo } from "../types/ApiTypes";

// ── Generic model type ──────────────────────────────────────────────

interface BaseModel {
  type: string;
  id: string;
  name: string;
  provider: string;
}

interface UseModelsResult<T> {
  models: T[];
  providers: ProviderInfo[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

// ── Capability → model type mapping ─────────────────────────────────

const CAPABILITY_MAP: Record<string, string> = {
  language_model: "generate_message",
  embedding_model: "generate_embedding",
  image_model: "text_to_image",
  tts_model: "text_to_speech",
  asr_model: "automatic_speech_recognition",
  video_model: "text_to_video",
};

/**
 * Returns the right hook result for a given model type string.
 * Used by the generic ModelSelector to fetch models of any type.
 */
export function useModelsForType(modelType: string): UseModelsResult<BaseModel> {
  const capability = CAPABILITY_MAP[modelType] ?? "generate_message";

  // React Query re-runs `select` whenever its identity changes, so an inline
  // arrow would re-filter on every render and invalidate `providers` below.
  const selectProviders = useCallback(
    (all: ProviderInfo[]) =>
      all.filter((p) => p.capabilities?.includes(capability)),
    [capability]
  );

  const providersQuery = trpc.models.providers.useQuery(undefined, {
    select: selectProviders,
  });
  const providers = useMemo(
    () => providersQuery.data ?? [],
    [providersQuery.data]
  );

  const modelQueries = trpc.useQueries((t) =>
    providers.map((p) => {
      const input = { provider: p.provider };
      switch (modelType) {
        case "image_model":
          return t.models.imageByProvider(input);
        case "tts_model":
          return t.models.ttsByProvider(input);
        case "asr_model":
          return t.models.asrByProvider(input);
        case "video_model":
          return t.models.videoByProvider(input);
        case "language_model":
        default:
          return t.models.llmByProvider(input);
      }
    })
  );

  // `useQueries` returns a fresh array every render, so memoizing the flatten +
  // sort on it never hits. The payloads keep their identity until a query moves.
  const payloads = modelQueries.map((query) => query.data);
  const payloadsRef = useRef(payloads);
  if (
    payloads.length !== payloadsRef.current.length ||
    payloads.some((data, index) => data !== payloadsRef.current[index])
  ) {
    payloadsRef.current = payloads;
  }
  const stablePayloads = payloadsRef.current;

  const models = useMemo(() => {
    const all: BaseModel[] = [];
    stablePayloads.forEach((data, index) => {
      if (data) {
        const provider = providers[index]?.provider ?? "";
        all.push(...normalizeModels<BaseModel>(data, provider));
      }
    });
    all.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return all;
  }, [stablePayloads, providers]);

  const isLoading =
    providersQuery.isLoading || modelQueries.some((query) => query.isLoading);
  const error =
    providersQuery.error?.message ??
    modelQueries.find((query) => query.error)?.error?.message ??
    null;

  const queriesRef = useRef(modelQueries);
  queriesRef.current = modelQueries;
  const refetchProviders = providersQuery.refetch;

  const refetch = useCallback(() => {
    refetchProviders();
    queriesRef.current.forEach((query) => query.refetch());
  }, [refetchProviders]);

  return { models, providers, isLoading, error, refetch };
}
