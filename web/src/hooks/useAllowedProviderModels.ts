import { useMemo } from "react";
import type { ModelsByProviderResult } from "./useModelsByProvider";

/**
 * Narrow a picker's models to the providers a node runs on. A provider-locked
 * node (one whose model default names a provider, like the Vertex AI or Codex
 * nodes) lists only that provider's live models. Without `allowedProviders`
 * the data passes through unchanged.
 */
export const useAllowedProviderModels = <T extends { provider?: string | null }>(
  modelData: ModelsByProviderResult<T>,
  allowedProviders?: string[]
): ModelsByProviderResult<T> => {
  const allowedKey = allowedProviders?.join(",") ?? "";
  return useMemo(() => {
    if (!allowedKey) return modelData;
    const allowed = new Set(allowedKey.toLowerCase().split(","));
    return {
      ...modelData,
      models: modelData.models.filter((m) =>
        allowed.has(String(m.provider ?? "").toLowerCase())
      ),
      providers: modelData.providers.filter((p) => allowed.has(p.toLowerCase()))
    };
  }, [modelData, allowedKey]);
};
