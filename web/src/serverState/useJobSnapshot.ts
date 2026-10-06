import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { trpcClient } from "../trpc/client";

export type JobSnapshot = Awaited<
  ReturnType<typeof trpcClient.jobs.snapshot.query>
>;

/**
 * The graph and params a run executed with. A run's snapshot never changes,
 * and a deleted job stays missing, so it is fetched once and not retried.
 */
export const useJobSnapshot = (
  jobId: string | null | undefined
): UseQueryResult<JobSnapshot> =>
  useQuery({
    queryKey: ["jobs", jobId, "snapshot"],
    queryFn: () => trpcClient.jobs.snapshot.query({ id: jobId as string }),
    enabled: Boolean(jobId),
    staleTime: Infinity,
    retry: false
  });
