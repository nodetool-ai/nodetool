/**
 * What an asset picker needs to offer Personal as a library (PRD D10).
 *
 * In a named project a picker lists the project's assets and a Personal tab.
 * An asset picked from Personal is copied into the project's `Imported/`
 * directory by `assets.copyToProject`, and the picker stores the copy's id,
 * so the project's documents never reference an asset of another project.
 */
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { trpcClient } from "../../trpc/client";

export type AssetPickSource = "project" | "personal";

export interface ProjectAssetPick {
  /** The project the picked asset is used in. */
  projectId: string;
  /**
   * The Personal project to offer as a second tab, or null when the picker
   * is already in Personal (or Personal is not known yet) and has one list.
   */
  personalProjectId: string | null;
  /**
   * The id the document stores for an asset picked from `source`: the asset
   * itself from the project's own list, its copy in the project from
   * Personal. Rejects when the copy fails.
   */
  idForProject: (assetId: string, source: AssetPickSource) => Promise<string>;
}

/**
 * The picking context of a picker in `projectId`, by default the active
 * project.
 */
export const useProjectAssetPick = (projectId?: string): ProjectAssetPick => {
  const queryClient = useQueryClient();
  const activeProjectId = useWorkspaceTabsStore(
    (state) => state.activeProjectId
  );
  const personalProjectId = useWorkspaceTabsStore(
    (state) => state.personalProjectId
  );
  const scopedProjectId = projectId ?? activeProjectId ?? LOOSE_PROJECT_ID;
  const inNamedProject =
    personalProjectId !== null &&
    scopedProjectId !== LOOSE_PROJECT_ID &&
    scopedProjectId !== personalProjectId;

  const idForProject = useCallback(
    async (assetId: string, source: AssetPickSource): Promise<string> => {
      if (source === "project" || !inNamedProject) {
        return assetId;
      }
      const result = await trpcClient.assets.copyToProject.mutate({
        asset_id: assetId,
        project_id: scopedProjectId
      });
      if (result.copied) {
        await queryClient.invalidateQueries({ queryKey: ["assets"] });
      }
      return result.asset.id;
    },
    [inNamedProject, queryClient, scopedProjectId]
  );

  return {
    projectId: scopedProjectId,
    personalProjectId: inNamedProject ? personalProjectId : null,
    idForProject
  };
};
