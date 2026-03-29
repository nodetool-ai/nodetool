import { useQuery } from "@tanstack/react-query";
import { BASE_URL } from "../stores/BASE_URL";
import { authHeader } from "../stores/ApiClient";

export interface Template {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

/**
 * Hook to fetch vibecoding templates from the backend.
 * 
 * Templates provide pre-configured prompts for common vibecoding tasks.
 * This hook queries the backend for the list of available templates.
 * 
 * @returns Object containing:
 *   - templates: Array of available templates
 *   - isLoading: Loading state for the query
 *   - isFetching: Fetching state (for background refreshes)
 *   - error: Error object if the query failed
 * 
 * @example
 * ```typescript
 * const { templates, isLoading, error } = useVibecodingTemplates();
 * 
 * if (isLoading) {
 *   return <Loading />;
 * }
 * 
 * return (
 *   <div>
 *     {templates?.map(template => (
 *       <button key={template.id}>{template.name}</button>
 *     ))}
 *   </div>
 * );
 * ```
 */
export const useVibecodingTemplates = () => {
  const {
    data: templates,
    isLoading,
    isFetching,
    error
  } = useQuery({
    queryKey: ["vibecodingTemplates"],
    queryFn: async () => {
      const headers = await authHeader();
      const response = await fetch(`${BASE_URL}/api/vibecoding/templates`, {
        headers
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return (await response.json()) as Template[];
    },
    refetchOnWindowFocus: false,
    // Templates are optional, so we can silently fail
    retry: false
  });

  return {
    templates,
    isLoading,
    isFetching,
    error
  };
};
