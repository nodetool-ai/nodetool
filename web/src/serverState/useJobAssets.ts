import { useQuery } from "@tanstack/react-query";
import { trpcClient } from "../trpc/client";
import { Asset } from "../stores/ApiTypes";

const fetchJobAssets = async (jobId: string): Promise<Asset[]> => {
  const data = await trpcClient.assets.list.query({ job_id: jobId });
  return (data.assets ?? []) as unknown as Asset[];
};

export const useJobAssets = (jobId: string) => {
  return useQuery({
    queryKey: ["assets", { job_id: jobId }],
    queryFn: () => fetchJobAssets(jobId),
    enabled: !!jobId,
    staleTime: 1000 * 60 * 5 // 5 minutes
  });
};
