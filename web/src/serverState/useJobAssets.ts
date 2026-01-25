import { useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import { AssetList } from "../stores/ApiTypes";
import { createErrorMessage } from "../utils/errorHandling";

const fetchJobAssets = async (jobId: string) => {
  const { data, error } = await client.GET("/api/assets/", {
    params: {
      query: {
        job_id: jobId
      }
    }
  });
  console.log("data", data);

  if (error) {
    throw createErrorMessage(error, "Failed to fetch job assets");
  }

  return (data as AssetList).assets;
};

export const useJobAssets = (jobId: string) => {
  return useQuery({
    queryKey: ["assets", { job_id: jobId }],
    queryFn: () => fetchJobAssets(jobId),
    enabled: !!jobId,
    staleTime: 1000 * 60 * 5 // 5 minutes
  });
};
