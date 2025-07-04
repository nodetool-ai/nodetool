import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import { CachedModel } from "../stores/ApiTypes";

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
    staleTime: Infinity, // path is effectively static; never considered stale
    gcTime: 1000 * 60 * 60 * 24, // garbage-collect after 24h when unused
    refetchOnWindowFocus: false
  });

  const ollamaBasePath: string | null = ollamaBasePathData?.path ?? null;

  const { data: huggingfaceBasePathData } = useQuery<{ path?: string } | null>({
    queryKey: ["huggingfaceBasePath"],
    queryFn: async () => {
      const { data, error } = await client.GET(
        "/api/models/huggingface_base_path",
        {}
      );
      if (error) {
        console.error(
          "[useModelBasePaths] Failed to fetch Hugging Face base path:",
          error
        );
        return null;
      }
      return data; // Expected shape: { path: string | null }
    },
    staleTime: Infinity, // path is effectively static; never considered stale
    gcTime: 1000 * 60 * 60 * 24, // garbage-collect after 24h when unused
    refetchOnWindowFocus: false
  });

  const huggingfaceBasePath: string | null = huggingfaceBasePathData?.path ?? null;

  return { huggingfaceBasePath, ollamaBasePath };
};
