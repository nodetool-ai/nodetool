import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { Job } from "../stores/ApiTypes";
import { trpcClient } from "../trpc/client";
import { useAuth } from "../stores/useAuth";

const fetchRunningJobs = async (): Promise<Job[]> => {
  const data = await trpcClient.jobs.list.query({ limit: 20 });
  return data.jobs ?? [];
};

/** Fetches running jobs, only when the user is authenticated. */
export const useRunningJobs = (): UseQueryResult<Job[], Error> => {
  const state = useAuth((auth) => auth.state);
  const isAuthenticated = state === "logged_in";

  return useQuery({
    queryKey: ["jobs"],
    queryFn: fetchRunningJobs,
    enabled: isAuthenticated,
    staleTime: 10000, // 10 seconds
    refetchOnMount: true,
    refetchOnWindowFocus: false
  });
};
