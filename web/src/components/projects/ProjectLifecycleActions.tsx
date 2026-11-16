import {
  useCallback,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent
} from "react";
import { useTranslation } from "react-i18next";

import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";

import {
  Box,
  ContextMenu,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  MenuItemPrimitive,
  SPACING,
  Text,
  ToolbarIconButton
} from "../ui_primitives";
import {
  useArchiveProject,
  useCollectProjectFiles,
  useDeleteProject,
  useExportProject,
  useRestoreProject
} from "../../hooks/useProjects";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  ProjectLinkedFilesError,
  type LinkedProjectFile
} from "../../utils/projectArchive";

interface ErrorWithMessage {
  readonly message: string;
}

/** The project folder as the project API reports it. */
interface ProjectFolder {
  readonly path: string | null;
  readonly is_accessible: boolean;
  /** What the server does to the folder when the project is deleted. */
  readonly on_delete: "trash" | "remove" | "keep";
}

interface ProjectLifecycleActionsProps {
  readonly project: {
    id: string;
    name: string;
    isPersonal: boolean;
    archivedAt: string | null;
    folder?: ProjectFolder | null;
  };
  /**
   * `buttons` lays the actions out as text buttons, for a list row.
   * `menu` folds them behind one overflow button, for a card, so the card's
   * footer is left to what the project is rather than what can be done to it.
   */
  readonly layout?: "buttons" | "menu";
}

/**
 * Which sentence the delete dialog shows about the project folder. A folder
 * the server cannot reach is left as it is, whoever made it.
 */
const folderMessageKey = (folder: ProjectFolder) => {
  if (!folder.is_accessible) {
    return "pass3_33.projects.lifecycle.deleteFolderMissing" as const;
  }
  switch (folder.on_delete) {
    case "trash":
      return "pass3_33.projects.lifecycle.deleteFolderTrash" as const;
    case "remove":
      return "pass3_33.projects.lifecycle.deleteFolderRemove" as const;
    case "keep":
      return "pass3_33.projects.lifecycle.deleteFolderKeep" as const;
  }
};

/**
 * The card around the actions opens its project on click and on Enter. The
 * menu and the delete dialog render in portals, but React still bubbles their
 * events through the component tree, so they stop here.
 */
const stopBubbling = (event: SyntheticEvent) => event.stopPropagation();
const stopKeyBubbling = (event: KeyboardEvent) => event.stopPropagation();

/**
 * Export, collect linked files into, archive, or permanently delete a named
 * project from its management surface.
 */
const ProjectLifecycleActions = ({
  project,
  layout = "buttons"
}: ProjectLifecycleActionsProps) => {
  const { t } = useTranslation();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  // Linked files that stopped an export, while the creator chooses.
  const [linkedFiles, setLinkedFiles] = useState<LinkedProjectFile[] | null>(
    null
  );
  const closeMenu = useCallback(() => setMenuAnchor(null), []);
  const archive = useArchiveProject();
  const restore = useRestoreProject();
  const remove = useDeleteProject();
  const exportProject = useExportProject();
  const collect = useCollectProjectFiles();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const stop = (event: MouseEvent<HTMLElement>) => event.stopPropagation();
  const reportError = useCallback(
    (
      action: "export" | "collect" | "archive" | "restore" | "delete",
      error: ErrorWithMessage
    ) =>
      addNotification({
        type: "error",
        alert: true,
        content: t("pass3_33.projects.lifecycle.error", {
          action: t(`pass3_33.projects.lifecycle.actions.${action}`),
          projectName: project.name,
          error: error.message
        })
      }),
    [addNotification, project.name, t]
  );
  const handleExport = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      stop(event);
      setMenuAnchor(null);
      exportProject.mutate(
        { id: project.id, name: project.name },
        {
          onError: (error) =>
            error instanceof ProjectLinkedFilesError
              ? setLinkedFiles(error.files)
              : reportError("export", error)
        }
      );
    },
    [exportProject, project.id, project.name, reportError]
  );
  const collectAndExport = useCallback(() => {
    exportProject.mutate(
      { id: project.id, name: project.name, collectLinked: true },
      {
        onSuccess: () => setLinkedFiles(null),
        onError: (error) => {
          if (error instanceof ProjectLinkedFilesError) {
            // Offline or failed files are still linked. Show what is left.
            setLinkedFiles(error.files);
          } else {
            setLinkedFiles(null);
            reportError("export", error);
          }
        }
      }
    );
  }, [exportProject, project.id, project.name, reportError]);
  const handleCollect = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      stop(event);
      setMenuAnchor(null);
      collect.mutate(
        { project_id: project.id },
        {
          onSuccess: (result) =>
            addNotification({
              type:
                result.failed.length > 0 || result.skipped.length > 0
                  ? "warning"
                  : "success",
              alert: result.failed.length > 0,
              content: t("pass3_33.projects.lifecycle.collectResult", {
                projectName: project.name,
                copied: result.copied.length,
                skipped: result.skipped.length,
                failed: result.failed.length
              })
            }),
          onError: (error) => reportError("collect", error)
        }
      );
    },
    [addNotification, collect, project.id, project.name, reportError, t]
  );
  const handleArchive = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      stop(event);
      setMenuAnchor(null);
      archive.mutate(
        { id: project.id },
        { onError: (error) => reportError("archive", error) }
      );
    },
    [archive, project.id, reportError]
  );
  const handleRestore = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      stop(event);
      setMenuAnchor(null);
      restore.mutate(
        { id: project.id },
        { onError: (error) => reportError("restore", error) }
      );
    },
    [project.id, reportError, restore]
  );
  const requestDelete = useCallback((event: MouseEvent<HTMLElement>) => {
    stop(event);
    setMenuAnchor(null);
    setConfirmingDelete(true);
  }, []);
  const confirmDelete = useCallback(() => {
    remove.mutate(
      { id: project.id },
      {
        onSuccess: (result) => {
          setConfirmingDelete(false);
          // The dialog promised the trash. Say so when the folder went
          // somewhere else, with the place it is in now.
          const { action, path } = result.folder;
          if (action !== "moved_aside" && action !== "trash_failed") {
            return;
          }
          const movedAside = path
            ? t("pass3_33.projects.lifecycle.folderMovedAsideTo", { path })
            : t("pass3_33.projects.lifecycle.folderMovedAside");
          const trashFailed = path
            ? t("pass3_33.projects.lifecycle.folderTrashFailedAt", { path })
            : t("pass3_33.projects.lifecycle.folderTrashFailed");
          addNotification({
            type: action === "moved_aside" ? "info" : "error",
            alert: true,
            content: action === "moved_aside" ? movedAside : trashFailed
          });
        },
        onError: (error) => reportError("delete", error)
      }
    );
  }, [addNotification, project.id, remove, reportError, t]);

  if (project.isPersonal) return null;

  const actions =
    layout === "menu" ? (
      <>
        <ToolbarIconButton
          icon={<MoreVertIcon />}
          tooltip={t("pass3_33.projects.lifecycle.projectActions")}
          ariaLabel={t("pass3_33.projects.lifecycle.actionsForProject", {
            projectName: project.name
          })}
          aria-haspopup="menu"
          aria-expanded={Boolean(menuAnchor)}
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            stop(event);
            setMenuAnchor(event.currentTarget);
          }}
        />
        <ContextMenu
          open={Boolean(menuAnchor)}
          anchorEl={menuAnchor}
          onClose={closeMenu}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          <MenuItemPrimitive
            label={
              exportProject.isPending
                ? t("pass3_33.projects.lifecycle.exporting")
                : t("pass3_33.projects.lifecycle.actions.export")
            }
            icon={<FileDownloadOutlinedIcon />}
            disabled={exportProject.isPending}
            onClick={handleExport}
          />
          <MenuItemPrimitive
            label={
              collect.isPending
                ? t("pass3_33.projects.lifecycle.collecting")
                : t("pass3_33.projects.lifecycle.actions.collect")
            }
            icon={<CreateNewFolderOutlinedIcon />}
            disabled={collect.isPending}
            onClick={handleCollect}
          />
          {project.archivedAt ? (
            <MenuItemPrimitive
              label={t("pass3_33.projects.lifecycle.actions.restore")}
              icon={<UnarchiveOutlinedIcon />}
              onClick={handleRestore}
            />
          ) : (
            <MenuItemPrimitive
              label={t("pass3_33.projects.lifecycle.actions.archive")}
              icon={<ArchiveOutlinedIcon />}
              onClick={handleArchive}
            />
          )}
          <MenuItemPrimitive
            label={t("pass3_33.projects.lifecycle.deleteProject")}
            icon={<DeleteOutlineIcon />}
            color="error"
            dividerBefore
            onClick={requestDelete}
          />
        </ContextMenu>
      </>
    ) : (
      <FlexRow gap={SPACING.sm}>
        <EditorButton
          density="compact"
          variant="text"
          onClick={handleExport}
          loading={exportProject.isPending}
        >
          {exportProject.isPending
            ? t("pass3_33.projects.lifecycle.exporting")
            : t("pass3_33.projects.lifecycle.actions.export")}
        </EditorButton>
        <EditorButton
          density="compact"
          variant="text"
          onClick={handleCollect}
          loading={collect.isPending}
        >
          {collect.isPending
            ? t("pass3_33.projects.lifecycle.collecting")
            : t("pass3_33.projects.lifecycle.actions.collect")}
        </EditorButton>
        {project.archivedAt ? (
          <EditorButton
            density="compact"
            variant="text"
            onClick={handleRestore}
          >
            {t("pass3_33.projects.lifecycle.actions.restore")}
          </EditorButton>
        ) : (
          <EditorButton
            density="compact"
            variant="text"
            onClick={handleArchive}
          >
            {t("pass3_33.projects.lifecycle.actions.archive")}
          </EditorButton>
        )}
        <EditorButton
          density="compact"
          color="error"
          variant="text"
          onClick={requestDelete}
        >
          {t("pass3_33.projects.lifecycle.actions.delete")}
        </EditorButton>
      </FlexRow>
    );

  return (
    <Box
      component="span"
      onClick={stopBubbling}
      onKeyDown={stopKeyBubbling}
      sx={{ display: "contents" }}
    >
      {actions}
      <Dialog
        open={linkedFiles !== null}
        onClose={() => !exportProject.isPending && setLinkedFiles(null)}
        title={t("pass3_33.projects.lifecycle.linkedTitle", {
          projectName: project.name
        })}
        onConfirm={collectAndExport}
        confirmText={t("pass3_33.projects.lifecycle.collectAndExport")}
        isLoading={exportProject.isPending}
      >
        <FlexColumn gap={SPACING.md}>
          <Text size="small">
            {t("pass3_33.projects.lifecycle.linkedBody")}
          </Text>
          <FlexColumn component="ul" gap={SPACING.xs} sx={{ m: 0, pl: SPACING.lg }}>
            {(linkedFiles ?? []).map((file) => (
              <Text key={file.id} component="li" size="small">
                {file.name}
              </Text>
            ))}
          </FlexColumn>
          <Text size="small">
            {t("pass3_33.projects.lifecycle.linkedChoice")}
          </Text>
        </FlexColumn>
      </Dialog>
      <Dialog
        open={confirmingDelete}
        onClose={() => !remove.isPending && setConfirmingDelete(false)}
        title={t("pass3_33.projects.lifecycle.confirmDeleteTitle", {
          projectName: project.name
        })}
        onConfirm={confirmDelete}
        confirmText={t("pass3_33.projects.lifecycle.deleteProject")}
        destructive
        isLoading={remove.isPending}
      >
        <FlexColumn gap={SPACING.md}>
          <Text size="small">
            {t("pass3_33.projects.lifecycle.confirmDeleteBody", {
              projectName: project.name
            })}
          </Text>
          {project.folder ? (
            <FlexColumn gap={SPACING.xs}>
              <Text size="small">{t(folderMessageKey(project.folder))}</Text>
              {project.folder.path ? (
                <Text
                  size="small"
                  family="secondary"
                  color="secondary"
                  sx={{ overflowWrap: "anywhere" }}
                >
                  {project.folder.path}
                </Text>
              ) : null}
            </FlexColumn>
          ) : null}
          <Text size="small">
            {t("pass3_33.projects.lifecycle.deleteIrreversible")}
          </Text>
        </FlexColumn>
      </Dialog>
    </Box>
  );
};

export default ProjectLifecycleActions;
