import { useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";

/**
 * Hook to fetch available Ollama models from the backend.
 * 
 * Ollama provides local language models that can be run on the user's machine.
 * This hook queries the backend for the list of available Ollama models.
 * 
 * @returns Object containing:
 *   - ollamaModels: Array of available Ollama models
 *   - ollamaLoading: Loading state for the query
 *   - ollamaIsFetching: Fetching state (for background refreshes)
 *   - ollamaError: Error object if the query failed
 * 
 * @example
 * ```typescript
 * const { ollamaModels, ollamaLoading, ollamaError } = useOllamaModels();
 * 
 * if (ollamaLoading) {
 *   return <Loading />;
 * }
 * 
 * return (
 *   <select>
 *     {ollamaModels?.map(model => (
 *       <option key={model.id} value={model.id}>{model.name}</option>
 *     ))}
 *   </select>
 * );
 * ```
 */
export const useOllamaModels = () => {
  const {
    data: ollamaModels,
    isLoading: ollamaLoading,
    isFetching: ollamaIsFetching,
    error: ollamaError
  } = useQuery({
    queryKey: ["ollamaModels"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/models/ollama", {});
      if (error) {throw error;}
      return data;
    },
    refetchOnWindowFocus: false
  });

  return {
    ollamaModels,
    ollamaLoading,
    ollamaIsFetching,
    ollamaError
  };
};
