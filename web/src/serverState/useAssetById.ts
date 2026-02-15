import { useQuery } from "@tanstack/react-query";
import { useAssetStore } from "../stores/AssetStore";

/**
 * Hook to fetch a single asset by ID using TanStack Query.
 * 
 * @param assetId - The ID of the asset to fetch
 * @returns Query result with asset data, loading state, and error
 */
export function useAssetById(assetId: string | undefined) {
  const getAsset = useAssetStore((state) => state.get);

  return useQuery({
    queryKey: ["asset", assetId],
    queryFn: async () => {
      if (!assetId) {
        throw new Error("Asset ID is required");
      }
      return await getAsset(assetId);
    },
    enabled: !!assetId
  });
}
