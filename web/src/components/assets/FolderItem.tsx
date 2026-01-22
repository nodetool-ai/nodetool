/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback } from "react";
import FolderIcon from "@mui/icons-material/Folder";
import NorthWest from "@mui/icons-material/NorthWest";
import { ButtonGroup, Typography } from "@mui/material";
import { Asset } from "../../stores/ApiTypes";
import { useAssetActions } from "./useAssetActions";
import DeleteButton from "../buttons/DeleteButton";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

const styles = (theme: Theme) =>
  css({
    "&": {
      position: "relative",
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "start",
      gap: ".3em",
      width: "100%",
      cursor: "pointer",
      boxSizing: "border-box",
      backgroundColor: "transparent",
      transition: "background-color 0.2s ease"
    },
    "&:hover p": {
      color: theme.vars.palette.grey[100]
    },
    ".folder-icon": {
      width: "25px",
      height: "100%",
      marginLeft: "2px",
      left: 0,
      color: theme.vars.palette.grey[500]
    },
    ".folder-icon:hover": {
      color: theme.vars.palette.grey[400]
    },
    "&.selected .folder-icon": {
      color: "var(--palette-secondary-main)"
    },
    ".parent-icon": {
      position: "absolute",
      color: "var(--c_folder)",
      width: "30%",
      height: "30%",
      bottom: "10%",
      right: "10%"
    },
    ".name": {
      marginTop: "0.4em",
      fontSize: theme.fontSizeSmall,
      textAlign: "left",
      verticalAlign: "middle",
      wordBreak: "break-word",
      maxWidth: "100%",
      maxHeight: "2.5em",
      overflow: "hidden",
      color: theme.vars.palette.grey[0]
    },
    "&.selected .name": {
      color: "var(--palette-text-primary)"
    },
    "&:hover": {
      color: theme.vars.palette.grey[200]
    },
    "&:hover .delete-button": {
      opacity: 1
    },
    "&.drag-hover": {
      backgroundColor: theme.vars.palette.grey[500]
    },
    ".delete-button": {
      position: "absolute",
      opacity: 0,
      width: "20px",
      minWidth: "20px",
      height: "20px",
      right: ".5em",
      top: 1,
      border: "none",
      color: theme.vars.palette.grey[400],
      transition: "opacity 0.2s .2s ease"
    },
    ".delete-button:hover": {
      border: "none",
      color: theme.vars.palette.c_delete
    }
  });

export interface FolderItemProps {
  folder: Asset;
  isParent?: boolean;
  isSelected?: boolean;
  enableContextMenu?: boolean;
  showDeleteButton?: boolean;
  onSelect: () => void;
  onClickParent?: (id: string) => void;
  openDeleteDialog?: () => void;
  children?: React.ReactNode;
}

const FolderItem: React.FC<FolderItemProps> = React.memo(({
  folder,
  isParent,
  isSelected,
  enableContextMenu = true,
  showDeleteButton = true,
  onSelect,
  children
}) => {
  const theme = useTheme();
  const {
    isDragHovered,
    handleDrag,
    handleDragEnd,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleContextMenu,
    handleDelete
  } = useAssetActions(folder);

  const handleClick = useCallback(() => {
    onSelect();
  }, [onSelect]);

  const handleContextMenuWrapper = useCallback((e: React.MouseEvent) => {
    handleContextMenu(e, enableContextMenu);
  }, [handleContextMenu, enableContextMenu]);

  const handleDeleteClick = useCallback(() => {
    handleDelete();
  }, [handleDelete]);

  return (
    <div
      css={styles(theme)}
      className={`folder-item ${isSelected ? "selected" : ""} ${
        isParent ? "parent" : ""
      } ${isDragHovered ? "drag-hover" : ""}`}
      onClick={handleClick}
      // onDoubleClick={() => handleDoubleClick(folder)}
      onDragStart={handleDrag}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={handleContextMenuWrapper}
      draggable
    >
      <FolderIcon className="folder-icon" />
      {children}
      {isParent && <NorthWest className="parent-icon" />}
      <Typography className="folder-name">{folder.name}</Typography>
      {showDeleteButton && (
        <ButtonGroup className="asset-item-actions" size="small">
          <DeleteButton<Asset>
            className="asset-delete"
            item={folder}
            component="span"
            onClick={handleDeleteClick}
          />
        </ButtonGroup>
      )}
    </div>
  );
});

export default FolderItem;
