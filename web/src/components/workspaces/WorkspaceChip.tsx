/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useMutation } from "@tanstack/react-query";
import useMediaQuery from "@mui/material/useMediaQuery";
import FolderIcon from "@mui/icons-material/Folder";
import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";

import {
  Caption,
  FlexRow,
  Popover,
  Text,
  MOTION,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
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

const styles = (theme: Theme) =>
  css({
    padding: `${getSpacingPx(SPACING.md)} 0`,
    minWidth: 260,
    maxWidth: 420,
    ".workspace-menu-header": {
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.xs)}`,
      color: theme.vars.palette.grey[400],
      textTransform: "uppercase",
      letterSpacing: 1
    },
    ".workspace-menu-item": {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: theme.spacing(3, 4),
      cursor: "pointer",
      color: theme.vars.palette.grey[100],
      transition: MOTION.background,
      "&:hover": { backgroundColor: theme.vars.palette.c_overlay },
      "&.selected": { backgroundColor: theme.vars.palette.c_overlay }
    },
    ".workspace-menu-icon": {
      color: theme.vars.palette.grey[300],
      display: "inline-flex"
    },
    ".workspace-menu-check": {
      marginLeft: "auto",
      color: theme.vars.palette.primary.main,
      display: "inline-flex"
    },
    ".workspace-menu-path": {
      color: theme.vars.palette.grey[400],
      fontFamily: "monospace",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  });

/**
 * Workspace picker for the composer footer, next to the model chip.
 *
 * The workspace is where a run reads and writes files (`workspace.write(...)`
 * in a Code node), so it belongs with the other run-context chips rather than
 * in the app-level chrome. It shows in chat as well as on the canvas: a chat
 * turn writes files too, into the workflow's workspace when one is open and
 * the default one otherwise — see {@link useCurrentWorkspace}.
 *
 * On a phone the chip drops its label and keeps the folder icon, so the chip
 * strip still fits the mode, model and permission chips without scrolling.
 */
const WorkspaceChip: React.FC = () => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
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
        content: String(error),
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
        label={isMobile ? undefined : selected?.name || "Workspace"}
        title={selected?.path ?? "Select a workspace folder"}
        active={open}
        showChevron={false}
        truncate
        maxWidth={140}
        onClick={() => setOpen(true)}
      />
      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => setOpen(false)}
        placement="top-left"
        paperSx={{
          backgroundColor: theme.vars.palette.grey[900],
          border: `1px solid ${theme.vars.palette.grey[800]}`,
          borderRadius: BORDER_RADIUS.sm,
          boxShadow: `0 12px 40px ${theme.vars.palette.c_scrim}`
        }}
      >
        <div css={cssStyles} role="menu" aria-label="Workspace">
          <Caption className="workspace-menu-header" size="small">
            Workspace
          </Caption>
          {workspaces.map((workspace) => {
            const isSelected = workspace.id === workspaceId;
            return (
              <div
                key={workspace.id}
                role="menuitemradio"
                aria-checked={isSelected}
                tabIndex={0}
                className={`workspace-menu-item${isSelected ? " selected" : ""}`}
                onClick={() => {
                  void setWorkspaceId(workspace.id);
                  setOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void setWorkspaceId(workspace.id);
                    setOpen(false);
                  }
                }}
              >
                <span className="workspace-menu-icon">
                  <FolderIcon fontSize="small" />
                </span>
                <FlexRow gap={0.5} sx={{ minWidth: 0, flexDirection: "column" }}>
                  <Text size="small">{workspace.name}</Text>
                  <Caption className="workspace-menu-path" size="small">
                    {workspace.path}
                  </Caption>
                </FlexRow>
                {isSelected && (
                  <span className="workspace-menu-check">
                    <CheckIcon fontSize="small" />
                  </span>
                )}
              </div>
            );
          })}
          {canManage && (
            <div
              role="menuitem"
              tabIndex={0}
              className="workspace-menu-item"
              onClick={handleAdd}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void handleAdd();
                }
              }}
            >
              <span className="workspace-menu-icon">
                <AddIcon fontSize="small" />
              </span>
              <Text size="small">Add workspace…</Text>
            </div>
          )}
        </div>
      </Popover>
      {folderPickerDialog}
    </>
  );
};

export default memo(WorkspaceChip);
