import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";

/**
 * useModelBasePaths
 * ------------------
 * A small utility hook that returns the base cache directories used for
 * HuggingFace Hub downloads and Ollama models.
 *
 * Ollama:      Obtained from the dedicated backend endpoint.
 * HuggingFace: Derived heuristically from the first model path returned by the
 *               `/api/models/huggingface_models` endpoint, falling back to the
 *               conventional `~/.cache/huggingface` if none are present.
 */
export const useModelBasePaths = () => {
  /**
   * Ollama – the backend exposes an explicit endpoint returning the base path
   * (or `null` when not found). We simply forward the response.
   */
  const { data: ollamaBasePathData } = useQuery<{ path?: string } | null>({
    queryKey: ["ollamaBasePath"],
    queryFn: async () => {
      const { data, error } = await client.GET(
        "/api/models/ollama_base_path",
        {}
      );
      if (error) {
        console.error(
          "[useModelBasePaths] Failed to fetch Ollama base path:",
          error
        );
        return null;
      }
      if (data?.error) {
        console.warn(
          "[useModelBasePaths] Backend returned error for Ollama base path:",
          data.error
        );
        return null;
      }
      return data; // Expected shape: { path: string | null }
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false
  });

  const ollamaBasePath: string | null = ollamaBasePathData?.path ?? null;

  /**
   * HuggingFace – there is no dedicated endpoint yet, so we attempt to
   * determine the cache directory from any downloaded model path. This keeps us
   * network-efficient because the models query is already cached in most
   * places. If everything fails, we fall back to the standard location.
   */
  const { data: hfModels } = useQuery({
    queryKey: ["huggingFaceModels"],
    queryFn: async () => {
      const { data, error } = await client.GET(
        "/api/models/huggingface_models",
        {}
      );
      if (error) {
        console.error(
          "[useModelBasePaths] Failed to fetch HuggingFace models:",
          error
        );
        return [];
      }
      return data ?? [];
    },
    // No need to refetch aggressively – model list rarely changes.
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false
  });

  const huggingfaceBasePath: string | null = useMemo(() => {
    if (Array.isArray(hfModels) && hfModels.length > 0) {
      // Find first model entry that exposes an on-disk path.
      const modelWithPath = hfModels.find(
        (m: any) => typeof m?.path === "string"
      );
      if (modelWithPath?.path) {
        const fullPath: string = modelWithPath.path;
        const idx = fullPath.toLowerCase().indexOf("huggingface");
        if (idx !== -1) {
          // Include the folder named "huggingface" in the returned path.
          return fullPath.slice(0, idx + "huggingface".length);
        }
      }
    }
    // Fallback for when nothing is cached yet – use the conventional location.
    return "~/.cache/huggingface";
  }, [hfModels]);

  return { huggingfaceBasePath, ollamaBasePath };
};
