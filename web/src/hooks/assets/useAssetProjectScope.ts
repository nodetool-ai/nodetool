import {
  ALL_PROJECTS,
  useAssetGridStore
} from "../../stores/AssetGridStore";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";

export interface AssetProjectScope {
  /** Project to list assets from; undefined lists every project. */
  projectId: string | undefined;
  /** Stable key for the scope, also when it spans every project. */
  scopeKey: string;
  /** The workspace's active project, which new assets go to by default. */
  activeProjectId: string;
}

/**
 * The project an asset explorer lists: its own project filter when one is
 * set, otherwise the workspace's active project.
 */
export const useAssetProjectScope = (): AssetProjectScope => {
  const projectFilter = useAssetGridStore((state) => state.projectFilter);
  const activeProjectId = useWorkspaceTabsStore(
    (state) =>
      state.activeProjectId ?? state.personalProjectId ?? LOOSE_PROJECT_ID
  );
  const scopeKey = projectFilter ?? activeProjectId;
  return {
    projectId: scopeKey === ALL_PROJECTS ? undefined : scopeKey,
    scopeKey,
    activeProjectId
  };
};
