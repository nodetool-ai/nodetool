import { useQuery } from "@tanstack/react-query";
import { useAssetStore } from "../stores/AssetStore";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../stores/WorkspaceTabsStore";

export function useFolderTree(sortBy: "name" | "updated_at" = "name") {
  const loadFolderTree = useAssetStore((state) => state.loadFolderTree);
  const activeProjectId =
    useWorkspaceTabsStore((state) => state.activeProjectId) ?? LOOSE_PROJECT_ID;

  return useQuery({
    queryKey: ["folderTree", sortBy, activeProjectId],
    queryFn: async () => await loadFolderTree(sortBy, activeProjectId),
    staleTime: 30_000
  });
}
