import { useQuery } from "@tanstack/react-query";
import { useAssetStore } from "../stores/AssetStore";

/**
 * Hook to fetch the folder tree structure using TanStack Query.
 * 
 * @param sortBy - How to sort folders ('name' or 'updated_at')
 * @returns Query result with folder tree data, loading state, and error
 */
export function useFolderTree(sortBy: "name" | "updated_at" = "name") {
  const loadFolderTree = useAssetStore((state) => state.loadFolderTree);

  return useQuery({
    queryKey: ["folderTree", sortBy],
    queryFn: async () => await loadFolderTree(sortBy)
  });
}
