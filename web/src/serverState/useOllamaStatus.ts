import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { trpc } from "../lib/trpc";

export type OllamaStatus = "connected" | "unreachable" | "unavailable";

export const useOllamaStatus = (): UseQueryResult<OllamaStatus, Error> =>
  useQuery({
    queryKey: ["ollama", "status"],
    queryFn: () => trpc.models.ollamaStatus.query(),
    staleTime: 10000,
    refetchInterval: 15000,
    retry: false
  });
