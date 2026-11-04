import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from "@tanstack/react-query";
import {
  trpcClient,
  type RouterInputs,
  type RouterOutputs
} from "../trpc/client";

export const torchQueryKeys = {
  capabilities: ["torch", "capabilities"] as const,
  jobs: ["torch", "jobs"] as const,
  job: (id: string | null) => ["torch", "jobs", id] as const
};

export const useTorchCapabilities = (): UseQueryResult<
  RouterOutputs["torch"]["capabilities"],
  Error
> =>
  useQuery({
    queryKey: torchQueryKeys.capabilities,
    queryFn: () => trpcClient.torch.capabilities.query(),
    staleTime: 60_000,
    retry: false
  });

export const useTorchStart = (): UseMutationResult<
  RouterOutputs["torch"]["start"],
  Error,
  RouterInputs["torch"]["start"]
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: RouterInputs["torch"]["start"]) =>
      trpcClient.torch.start.mutate(request),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: torchQueryKeys.jobs })
  });
};

export const useTorchStatus = (
  jobId: string | null
): UseQueryResult<RouterOutputs["torch"]["status"], Error> =>
  useQuery({
    queryKey: torchQueryKeys.job(jobId),
    queryFn: () => {
      if (!jobId) {
        throw new Error("A Torch job ID is required");
      }
      return trpcClient.torch.status.query({ job_id: jobId });
    },
    enabled: jobId !== null,
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" ||
        status === "failed" ||
        status === "cancelled"
        ? false
        : 1000;
    }
  });

export const useTorchCancel = (): UseMutationResult<
  RouterOutputs["jobs"]["cancel"],
  Error,
  string
> => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => trpcClient.jobs.cancel.mutate({ id: jobId }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: torchQueryKeys.jobs })
  });
};
