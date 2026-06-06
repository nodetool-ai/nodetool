import { useQuery } from "@tanstack/react-query";
import { trpc } from "../lib/trpc";

interface OllamaModel {
  type: string;
  name: string;
  repo_id: string;
  modified_at: string;
  size: number;
  digest: string;
  details: Record<string, unknown>;
}

interface UseOllamaModelsResult {
  ollamaModels: OllamaModel[] | undefined;
  ollamaLoading: boolean;
  ollamaIsFetching: boolean;
  ollamaError: Error | null;
}

export const useOllamaModels = (): UseOllamaModelsResult => {
  const {
    data: ollamaModels,
    isLoading: ollamaLoading,
    isFetching: ollamaIsFetching,
    error: ollamaError
  } = useQuery({
    queryKey: ["ollamaModels"],
    queryFn: () => trpc.models.ollama.query(),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });

  return {
    ollamaModels,
    ollamaLoading,
    ollamaIsFetching,
    ollamaError
  };
};
