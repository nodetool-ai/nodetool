/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import PhotoLibraryOutlinedIcon from "@mui/icons-material/PhotoLibraryOutlined";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";

import {
  Caption,
  Text,
  TextInput,
  Popover,
  MOTION,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { useFolderTree } from "../../serverState/useFolderTree";
import { useAssetStore, type AssetTreeNode } from "../../stores/AssetStore";
import { useNotificationStore } from "../../stores/NotificationStore";

interface SaveToFolderMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  /** Chosen asset-library folder id, or `null` for the library root. */
  onSelectFolder: (folderId: string | null) => void;
}

const styles = (theme: Theme) =>
  css({
    padding: `${getSpacingPx(SPACING.md)} 0`,
    ".folder-menu-header": {
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.xs)}`,
      color: theme.vars.palette.grey[400],
      textTransform: "uppercase",
      letterSpacing: 1
    },
    ".folder-menu-scroll": {
      maxHeight: 320,
      overflowY: "auto"
    },
    ".folder-menu-item": {
      display: "flex",
      alignItems: "center",
      gap: 8,
      paddingTop: getSpacingPx(SPACING.sm),
      paddingBottom: getSpacingPx(SPACING.sm),
      paddingRight: getSpacingPx(SPACING.xl),
      cursor: "pointer",
      color: theme.vars.palette.grey[100],
      transition: MOTION.background,
      "&:hover": {
        backgroundColor: theme.vars.palette.c_overlay
      }
    },
    ".folder-menu-icon": {
      color: theme.vars.palette.grey[300],
      display: "inline-flex"
    },
    ".folder-menu-footer": {
      marginTop: getSpacingPx(SPACING.xs),
      paddingTop: getSpacingPx(SPACING.xs),
      borderTop: `1px solid ${theme.vars.palette.grey[800]}`
    },
    ".folder-menu-new-input": {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`
    }
  });

/**
 * Anchored asset-library folder chooser. A popover tree of folders (styled to
 * match the composer option menus) with an inline "new folder" affordance;
 * picking a row calls `onSelectFolder` with the folder id (or `null` for the
 * library root). Shared by the "Save as Asset" actions in the sketch and
 * timeline editors.
 */
const SaveToFolderMenu: React.FC<SaveToFolderMenuProps> = ({
  anchorEl,
  open,
  onClose,
  onSelectFolder
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const { data: folderTree = {} } = useFolderTree("name");
  const createFolder = useAssetStore((state) => state.createFolder);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const select = useCallback(
    (id: string | null) => {
      onSelectFolder(id);
      onClose();
    },
    [onSelectFolder, onClose]
  );

  const resetCreate = useCallback(() => {
    setCreating(false);
    setNewName("");
  }, []);

  // Create a folder at the library root, then save straight into it.
  const handleCreateFolder = useCallback(async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const folder = await createFolder(null, name);
      resetCreate();
      select(folder.id);
    } catch (error) {
      useNotificationStore.getState().addNotification({
        type: "error",
        alert: true,
        content: `Could not create folder: ${
          error instanceof Error ? error.message : String(error)
        }`
      });
      setBusy(false);
    }
  }, [newName, busy, createFolder, resetCreate, select]);

  const roots = useMemo(
    () => Object.values(folderTree).filter((node) => node?.id),
    [folderTree]
  );

  const renderRow = useCallback(
    (
      id: string | null,
      name: string,
      icon: React.ReactNode,
      depth: number
    ): React.ReactNode => (
      <div
        className="folder-menu-item"
        role="menuitem"
        tabIndex={0}
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={() => select(id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            select(id);
          }
        }}
      >
        <span className="folder-menu-icon">{icon}</span>
        <Text size="normal" weight={500} sx={{ color: "inherit" }}>
          {name}
        </Text>
      </div>
    ),
    [select]
  );

  const renderNode = useCallback(
    (node: AssetTreeNode, depth: number): React.ReactNode => {
      if (!node.id) return null;
      return (
        <React.Fragment key={node.id}>
          {renderRow(
            node.id,
            node.name,
            <FolderOutlinedIcon fontSize="small" />,
            depth
          )}
          {Array.isArray(node.children)
            ? node.children.map((child) => renderNode(child, depth + 1))
            : null}
        </React.Fragment>
      );
    },
    [renderRow]
  );

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      placement="bottom-right"
      paperSx={{
        backgroundColor: theme.vars.palette.grey[900],
        border: `1px solid ${theme.vars.palette.grey[800]}`,
        borderRadius: BORDER_RADIUS.sm,
        minWidth: 240,
        boxShadow: `0 12px 40px ${theme.vars.palette.c_scrim}`
      }}
    >
      <div css={cssStyles} role="menu">
        <Caption className="folder-menu-header" size="small">
          Save to folder
        </Caption>
        <div className="folder-menu-scroll">
          {renderRow(
            null,
            "Assets",
            <PhotoLibraryOutlinedIcon fontSize="small" />,
            0
          )}
          {roots.map((node) => renderNode(node, 0))}
        </div>

        <div className="folder-menu-footer">
          {creating ? (
            <div className="folder-menu-new-input">
              <span className="folder-menu-icon">
                <CreateNewFolderOutlinedIcon fontSize="small" />
              </span>
              <TextInput
                autoFocus
                compact
                fullWidth
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Folder name…"
                disabled={busy}
                inputProps={{ "aria-label": "New folder name" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreateFolder();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    resetCreate();
                  }
                }}
                onBlur={resetCreate}
              />
            </div>
          ) : (
            <div
              className="folder-menu-item"
              role="menuitem"
              tabIndex={0}
              style={{ paddingLeft: 12 }}
              onClick={() => setCreating(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setCreating(true);
                }
              }}
            >
              <span className="folder-menu-icon">
                <CreateNewFolderOutlinedIcon fontSize="small" />
              </span>
              <Text size="normal" weight={500} sx={{ color: "inherit" }}>
                New folder…
              </Text>
            </div>
          )}
        </div>
      </div>
    </Popover>
  );
};

export default SaveToFolderMenu;
