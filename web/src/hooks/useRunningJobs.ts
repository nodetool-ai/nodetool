import { useQuery } from "@tanstack/react-query";
import { Job, JobListResponse } from "../stores/ApiTypes";
import { client } from "../stores/ApiClient";
import { createErrorMessage } from "../utils/errorHandling";
import { useAuth } from "../stores/useAuth";

/**
 * Fetches running jobs from the API
 * Note: If the /api/jobs/ endpoint is not in api.ts, regenerate the OpenAPI schema
 * by running: npm run openapi (requires backend to be running on port 8000)
 */
const fetchRunningJobs = async (): Promise<Job[]> => {
  const { data, error } = await client.GET("/api/jobs/", {
    params: {
      query: {
        limit: 100
      }
    }
  });

  if (error) {
    throw createErrorMessage(error, "Failed to fetch running jobs");
  }

  // Filter to only return jobs that are active (need reconnection)
  // Include suspended/paused since they may need UI state sync
  const activeStatuses = new Set([
    "running",
    "queued",
    "starting",
    "suspended",
    "paused"
  ]);
  const jobs = (data as JobListResponse | undefined)?.jobs ?? [];

  return (jobs as Job[]).filter((job) => activeStatuses.has(job.status));
};

/**
 * Hook to fetch running jobs
 * Only runs when user is authenticated
 */
export const useRunningJobs = () => {
  const { user, state } = useAuth();
  const isAuthenticated = state === "logged_in";

  return useQuery({
    queryKey: ["jobs", "running", user?.id],
    queryFn: fetchRunningJobs,
    enabled: isAuthenticated,
    staleTime: 10000, // 10 seconds
    refetchOnMount: true,
    refetchOnWindowFocus: false
  });
};
