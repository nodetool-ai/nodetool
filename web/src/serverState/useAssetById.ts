import { useQuery } from "@tanstack/react-query";
import { useAssetStore } from "../stores/AssetStore";

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
