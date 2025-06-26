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
        const lower = fullPath.toLowerCase();
        const hfIdx = lower.indexOf("huggingface");
        if (hfIdx !== -1) {
          // We want the path that includes the "huggingface/hub" directory because the backend
          // restricts file-explorer access to that root. Determine whether the string already
          // contains "huggingface/hub" (or with backslashes) and include it; otherwise append
          // the missing segment.

          // Compute end index of the "huggingface" segment in the original string (case-preserving).
          const hfBase = fullPath.slice(0, hfIdx + "huggingface".length);

          // Check if the remainder already begins with a path separator followed by "hub".
          const remainder = fullPath.slice(hfIdx + "huggingface".length);
          const hasHub = /[\\/]+hub/i.test(remainder);

          if (hasHub) {
            // Up to and including the "hub" directory.
            const hubIdx = lower.indexOf("hub", hfIdx + "huggingface".length);
            return fullPath.slice(0, hubIdx + "hub".length);
          }

          // Otherwise, append the separator + "hub".
          const separator = fullPath.includes("\\") ? "\\" : "/";
          return hfBase + separator + "hub";
        }
      }
    }
    // Fallback for when nothing is cached yet – use the conventional location.
    return "~/.cache/huggingface";
  }, [hfModels]);

  return { huggingfaceBasePath, ollamaBasePath };
};
