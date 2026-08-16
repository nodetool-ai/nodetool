import { useQuery } from "@tanstack/react-query";
import { trpc } from "../lib/trpc";

/** `details` block of an Ollama `/api/tags` entry. */
interface OllamaModelDetails {
  parent_model?: string;
  format?: string;
  family?: string;
  families?: string[] | null;
  parameter_size?: string;
  quantization_level?: string;
}

interface OllamaModel {
  type: string;
  name: string;
  repo_id: string;
  modified_at: string;
  size: number;
  digest: string;
  details: OllamaModelDetails;
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
