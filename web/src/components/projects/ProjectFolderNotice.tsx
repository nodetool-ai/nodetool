import { useCallback, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";

import { useProjects, useRelocateProject } from "../../hooks/useProjects";
import { LOOSE_PROJECT_ID } from "../../stores/WorkspaceTabsStore";
import { useWorkspaces } from "../../hooks/useWorkspaces";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useFolderPicker } from "../workspaces/useFolderPicker";
import { AlertBanner, Box, EditorButton } from "../ui_primitives";
import type { RouterOutputs } from "../../trpc/client";

type ProjectResponse = RouterOutputs["projects"]["list"][number];

interface ProjectFolderNoticeProps {
  readonly project: Pick<ProjectResponse, "id" | "name" | "folder"> | undefined;
  /** Tighter padding, for a project card. */
  readonly compact?: boolean;
}

/**
 * The card around the notice opens its project on click. The folder picker
 * renders in a portal, but React still bubbles its events through the tree.
 */
const stopBubbling = (event: SyntheticEvent) => event.stopPropagation();

/**
 * "Folder not found" for a project whose folder is unreachable, with Locate,
 * which points the project at the folder's new place. Locate is offered only
 * where the server lets the user choose host folders, so a production server
 * shows the state alone.
 */
const FolderNotFoundBanner = ({
  project,
  compact
}: {
  readonly project: Pick<ProjectResponse, "id" | "name">;
  readonly compact: boolean;
}) => {
  const { t } = useTranslation();
  const { canManage } = useWorkspaces();
  const relocate = useRelocateProject();
  const { pickFolder, dialog } = useFolderPicker();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const locate = useCallback(
    async (event: SyntheticEvent) => {
      event.stopPropagation();
      const path = await pickFolder();
      if (!path) {
        return;
      }
      try {
        await relocate.mutateAsync({ project_id: project.id, path });
      } catch (error) {
        addNotification({
          type: "error",
          alert: true,
          content: t("pass3_32.projects.folder.locateError", {
            error: error instanceof Error ? error.message : String(error)
          })
        });
      }
    },
    [addNotification, pickFolder, project, relocate, t]
  );

  return (
    <Box onClick={stopBubbling} onKeyDown={stopBubbling}>
      <AlertBanner
        severity="warning"
        compact={compact}
        title={t("pass3_32.projects.folder.notFound")}
        action={
          canManage ? (
            <EditorButton
              size="small"
              variant="outlined"
              onClick={(event) => void locate(event)}
              disabled={relocate.isPending}
            >
              {t("pass3_32.projects.folder.locate")}
            </EditorButton>
          ) : undefined
        }
      >
        {t("pass3_32.projects.folder.notFoundDetail", { name: project.name })}
      </AlertBanner>
      {dialog}
    </Box>
  );
};

/**
 * "Moving files into the project folder", shown while the files of assets
 * from before project folders are moved in. The assets stay available, so
 * the notice states progress and offers no action.
 */
const MovingFilesBanner = ({
  moving,
  compact
}: {
  readonly moving: { readonly done: number; readonly total: number };
  readonly compact: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <AlertBanner
      severity="info"
      compact={compact}
      title={t("pass3_32.projects.folder.moving")}
    >
      {t("pass3_32.projects.folder.movingDetail", {
        done: moving.done,
        total: moving.total
      })}
    </AlertBanner>
  );
};

/**
 * The folder state of a project. Renders nothing while its folder is
 * reachable and no files are being moved into it.
 */
const ProjectFolderNotice = ({
  project,
  compact = false
}: ProjectFolderNoticeProps) => {
  if (!project?.folder) {
    return null;
  }
  if (!project.folder.is_accessible) {
    return <FolderNotFoundBanner project={project} compact={compact} />;
  }
  if (project.folder.moving) {
    return <MovingFilesBanner moving={project.folder.moving} compact={compact} />;
  }
  return null;
};

/**
 * The notice for a project named by id, as the left panel holds it. The loose
 * bucket's id stands for Personal, whose folder holds loose documents.
 */
export const ProjectFolderNoticeById = ({
  projectId
}: {
  readonly projectId: string;
}) => {
  const { data: projects } = useProjects();
  const project = projects?.find((candidate) =>
    projectId === LOOSE_PROJECT_ID
      ? candidate.isPersonal
      : candidate.id === projectId
  );
  return <ProjectFolderNotice project={project} />;
};

export default ProjectFolderNotice;
