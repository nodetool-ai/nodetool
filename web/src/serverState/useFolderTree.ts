import { useQuery } from "@tanstack/react-query";
import { useAssetStore } from "../stores/AssetStore";

export function useFolderTree(sortBy: "name" | "updated_at" = "name") {
  const loadFolderTree = useAssetStore((state) => state.loadFolderTree);

  return useQuery({
    queryKey: ["folderTree", sortBy],
    queryFn: async () => await loadFolderTree(sortBy)
  });
}
