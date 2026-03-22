import { useQuery } from "@tanstack/react-query";
import { checkHfCache, HfCacheCheckRequest, HfCacheCheckResponse } from "../serverState/checkHfCache";

/**
 * Hook to check HuggingFace cache for a model.
 * 
 * This hook queries the backend to check if all required files for a HuggingFace
 * model are present in the local cache.
 * 
 * @param request - The cache check request containing repo_id and optional patterns
 * @param enabled - Whether the query should run (default: true)
 * @returns Object containing:
 *   - data: Cache check response with all_present status and missing files
 *   - isLoading: Loading state for the query
 *   - isFetching: Fetching state (for background refreshes)
 *   - error: Error object if the query failed
 * 
 * @example
 * ```typescript
 * const { data, isLoading, error } = useCheckHfCache({
 *   repo_id: "stabilityai/stable-diffusion-xl-base-1.0",
 *   allow_pattern: "*.safetensors"
 * });
 * 
 * if (isLoading) {
 *   return <Loading />;
 * }
 * 
 * return (
 *   <div>
 *     {data?.all_present ? "All files cached" : `Missing: ${data?.missing.join(", ")}`}
 *   </div>
 * );
 * ```
 */
export const useCheckHfCache = (
  request: HfCacheCheckRequest,
  enabled: boolean = true
) => {
  return useQuery<HfCacheCheckResponse, Error>({
    queryKey: ["hfCache", request.repo_id, request.allow_pattern, request.ignore_pattern],
    queryFn: () => checkHfCache(request),
    enabled: enabled && !!request.repo_id,
    refetchOnWindowFocus: false,
    // Cache results for 5 minutes
    staleTime: 5 * 60 * 1000
  });
};
