import { useQuery } from "@tanstack/react-query";
import { useAssetStore } from "../stores/AssetStore";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../stores/WorkspaceTabsStore";

export function useFolderTree(sortBy: "name" | "updated_at" = "name") {
  const loadFolderTree = useAssetStore((state) => state.loadFolderTree);
  // Same scope as useAssets, which creates the folders this tree lists.
  const activeProjectId = useWorkspaceTabsStore(
    (state) =>
      state.activeProjectId ?? state.personalProjectId ?? LOOSE_PROJECT_ID
  );

  return useQuery({
    queryKey: ["folderTree", sortBy, activeProjectId],
    queryFn: async () => await loadFolderTree(sortBy, activeProjectId),
    staleTime: 30_000
  });
}
