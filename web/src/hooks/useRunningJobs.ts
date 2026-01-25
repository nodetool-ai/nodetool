import { useQuery } from "@tanstack/react-query";
import { Job, JobListResponse } from "../stores/ApiTypes";
import { client } from "../stores/ApiClient";
import { createErrorMessage } from "../utils/errorHandling";
import { useAuth } from "../stores/useAuth";

/**
 * Fetches running jobs from the API
 */
const fetchRunningJobs = async (): Promise<Job[]> => {
  const { data, error } = await client.GET("/api/jobs/", {
    params: {
      query: {
        limit: 20
      }
    }
  });

  if (error) {
    throw createErrorMessage(error, "Failed to fetch running jobs");
  }

  return (data as JobListResponse | undefined)?.jobs ?? [];
};

/**
 * Hook to fetch running jobs
 * Only runs when user is authenticated
 */
export const useRunningJobs = () => {
  const { state } = useAuth((auth) => ({
    state: auth.state
  }));
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
