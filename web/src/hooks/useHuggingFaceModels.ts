import { useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";

/**
 * Hook to fetch available HuggingFace models from the backend.
 * 
 * HuggingFace provides a wide range of AI models for various tasks including
 * text generation, image processing, audio, and more. This hook queries
 * the backend for the list of available HuggingFace models.
 * 
 * @returns Object containing:
 *   - hfModels: Array of available HuggingFace models
 *   - hfLoading: Loading state for the query
 *   - hfIsFetching: Fetching state (for background refreshes)
 *   - hfError: Error object if the query failed
 * 
 * @example
 * ```typescript
 * const { hfModels, hfLoading, hfError } = useHuggingFaceModels();
 * 
 * if (hfLoading) {
 *   return <Loading />;
 * }
 * 
 * return (
 *   <select>
 *     {hfModels?.map(model => (
 *       <option key={model.id} value={model.id}>{model.name}</option>
 *     ))}
 *   </select>
 * );
 * ```
 */
export const useHuggingFaceModels = () => {
  const {
    data: hfModels,
    isLoading: hfLoading,
    isFetching: hfIsFetching,
    error: hfError
  } = useQuery({
    queryKey: ["huggingFaceModels"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/models/huggingface", {});
      if (error) {throw error;}
      return data;
    },
    refetchOnWindowFocus: false
  });

  return {
    hfModels,
    hfLoading,
    hfIsFetching,
    hfError
  };
};
