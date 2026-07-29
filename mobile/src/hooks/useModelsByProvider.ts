/**
 * Hooks for fetching models by provider, mirroring the web's useModelsByProvider.
 *
 * Fetches providers with the relevant capability, then fans out to one
 * `*ByProvider` query per provider via `trpc.useQueries`. Results are flattened
 * and sorted into a single array. All requests go through tRPC + React Query so
 * results are cached and shared across the app.
 */

import { useCallback, useMemo } from "react";
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

  const providersQuery = trpc.models.providers.useQuery(undefined, {
    select: (all) =>
      (all as ProviderInfo[]).filter((p) =>
        p.capabilities?.includes(capability)
      ),
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

  const models = useMemo(() => {
    const all: BaseModel[] = [];
    modelQueries.forEach((query, index) => {
      if (query.data) {
        const provider = providers[index]?.provider ?? "";
        all.push(
          ...normalizeModels<BaseModel>(query.data, provider)
        );
      }
    });
    all.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return all;
  }, [modelQueries, providers]);

  const isLoading =
    providersQuery.isLoading || modelQueries.some((query) => query.isLoading);
  const error =
    providersQuery.error?.message ??
    modelQueries.find((query) => query.error)?.error?.message ??
    null;

  const refetch = useCallback(() => {
    providersQuery.refetch();
    modelQueries.forEach((query) => query.refetch());
  }, [providersQuery, modelQueries]);

  return { models, providers, isLoading, error, refetch };
}
