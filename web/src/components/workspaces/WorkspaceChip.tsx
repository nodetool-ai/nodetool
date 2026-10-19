import React, { memo, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import { useMutation } from "@tanstack/react-query";
import useMediaQuery from "@mui/material/useMediaQuery";
import FolderIcon from "@mui/icons-material/FolderOutlined";
import AddIcon from "@mui/icons-material/AddOutlined";

import {
  ContextMenu,
  ListSubheader,
  MenuItemPrimitive
} from "../ui_primitives";
import MediaControlChip from "../chat/composer/MediaControlChip";
import { trpcClient } from "../../trpc/client";
import type { WorkspaceResponse } from "../../stores/ApiTypes";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useCurrentWorkspace } from "../../hooks/useCurrentWorkspace";
import {
  useWorkspaces,
  useWorkspaceCacheWriter
} from "../../hooks/useWorkspaces";
import { useFolderPicker } from "./useFolderPicker";

/** Derive a workspace name from an absolute folder path. */
function nameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/**
 * Workspace picker for the composer footer, next to the model chip.
 *
 * The workspace is where a run reads and writes files (`workspace.write(...)`
 * in a Code node), so it belongs with the other run-context chips rather than
 * in the app-level chrome. It shows in chat as well as on the canvas: a chat
 * turn writes files too, into the workflow's workspace when one is open and
 * the default one otherwise — see {@link useCurrentWorkspace}.
 *
 * In a narrow composer the chip drops its label and keeps the folder icon, so
 * the chip strip still fits the mode, model and permission chips on one line.
 */
interface WorkspaceChipProps {
  /** Icon only. The composer sets it from its own width. */
  compact?: boolean;
}

const WorkspaceChip: React.FC<WorkspaceChipProps> = ({ compact = false }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const writeWorkspaceToCache = useWorkspaceCacheWriter();
  const addNotification = useNotificationStore((state) => state.addNotification);
  const { pickFolder, dialog: folderPickerDialog } = useFolderPicker();
  const { workspaceId, workspace: selected, setWorkspaceId, canManage } =
    useCurrentWorkspace();
  const { workspaces } = useWorkspaces();

  const createMutation = useMutation({
    mutationFn: async (path: string) =>
      trpcClient.workspace.create.mutate({
        name: nameFromPath(path),
        path,
        is_default: false
      }),
    onSuccess: (created) => {
      writeWorkspaceToCache(created as WorkspaceResponse);
      void setWorkspaceId((created as WorkspaceResponse).id);
    },
    onError: (error) => {
      addNotification({
        type: "error",
        alert: true,
        content: t("batch2_1.errors.operation", { error: String(error) }),
        dismissable: true
      });
    }
  });

  const handleAdd = useCallback(async () => {
    setOpen(false);
    const path = await pickFolder();
    if (path) {
      createMutation.mutate(path);
    }
  }, [pickFolder, createMutation]);

  return (
    <>
      <MediaControlChip
        ref={anchorRef}
        icon={<FolderIcon fontSize="small" />}
        label={
          isMobile || compact ? undefined : selected?.name || t("batch2_1.common.workspace")
        }
        title={selected?.path ?? t("batch2_1.folderPicker.title")}
        active={open}
        showChevron={false}
        truncate
        maxWidth={140}
        onClick={() => setOpen(true)}
      />
      <ContextMenu
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
        minWidth={260}
        paperSx={{ maxWidth: 420 }}
        slotProps={{ list: { "aria-label": t("batch2_1.common.workspace") } }}
      >
        <ListSubheader>{t("batch2_1.common.workspace")}</ListSubheader>
        {workspaces.map((workspace) => {
          const isSelected = workspace.id === workspaceId;
          return (
            <MenuItemPrimitive
              key={workspace.id}
              label={workspace.name}
              secondary={workspace.path}
              icon={<FolderIcon fontSize="small" />}
              checkable="radio"
              checked={isSelected}
              onClick={() => {
                void setWorkspaceId(workspace.id);
                setOpen(false);
              }}
            />
          );
        })}
        {canManage && (
          <MenuItemPrimitive
            label={t("batch2_1.select.addWorkspace")}
            icon={<AddIcon fontSize="small" />}
            dividerBefore={workspaces.length > 0}
            onClick={() => void handleAdd()}
          />
        )}
      </ContextMenu>
      {folderPickerDialog}
    </>
  );
};

export default memo(WorkspaceChip);
