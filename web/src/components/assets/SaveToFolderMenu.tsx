/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import PhotoLibraryOutlinedIcon from "@mui/icons-material/PhotoLibraryOutlined";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";

import {
  TextInput,
  Popover,
  SPACING,
  SPACING_PX,
  getSpacingPx,
  menuGroupHeaderStyles,
  menuItemStyles,
  menuListStyles,
  menuPaperStyles,
  MENU_ICON_SIZE
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

// A tree with an inline "new folder" field is not a plain list, so this stays
// a Popover, drawn with the shared menu surface and row styles.
const styles = (theme: Theme) =>
  css({
    ...menuListStyles(theme),
    ".folder-menu-header": {
      ...menuGroupHeaderStyles(theme),
      display: "block"
    },
    ".folder-menu-scroll": {
      maxHeight: 320,
      overflowY: "auto"
    },
    ".folder-menu-item": {
      ...menuItemStyles(theme),
      display: "flex",
      alignItems: "center",
      cursor: "pointer"
    },
    ".folder-menu-icon": {
      display: "inline-flex",
      color: theme.vars.palette.text.secondary,
      "& .MuiSvgIcon-root": { fontSize: MENU_ICON_SIZE }
    },
    ".folder-menu-footer": {
      marginTop: getSpacingPx(SPACING.xs),
      paddingTop: getSpacingPx(SPACING.xs),
      borderTop: `1px solid ${theme.vars.palette.divider}`
    },
    ".folder-menu-new-input": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md),
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.lg)}`
    }
  });

/**
 * Anchored asset-library folder chooser. A popover tree of folders (drawn
 * with the shared menu styles) with an inline "new folder" affordance;
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
        style={{ paddingLeft: SPACING_PX.md + depth * SPACING_PX.xl }}
        onClick={() => select(id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            select(id);
          }
        }}
      >
        <span className="folder-menu-icon">{icon}</span>
        <span>{name}</span>
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
      paperSx={[menuPaperStyles(theme), { minWidth: 240 }]}
    >
      <div css={cssStyles} role="menu">
        <span className="folder-menu-header">Save to folder</span>
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
              <span>New folder…</span>
            </div>
          )}
        </div>
      </div>
    </Popover>
  );
};

export default SaveToFolderMenu;
