/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
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
      height: "auto",
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
      marginLeft: "2px", // add a tiny gutter to avoid overlap with accordion arrow
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
      color: "var(--palette-primary-main)"
    },
    "&:hover": {
      color: theme.vars.palette.grey[200]
    },
    "&:hover .delete-button": {
      opacity: 0
    },
    "&.drag-hover": {
      backgroundColor: theme.vars.palette.grey[500]
    },
    ".delete-button": {
      position: "absolute",
      zIndex: 10,
      opacity: 0,
      width: "20px",
      minWidth: "20px",
      height: "20px",
      right: "0",
      top: "0",
      border: "none",
      color: theme.vars.palette.grey[400]
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
}

const FolderItem: React.FC<FolderItemProps> = ({
  folder,
  isParent,
  isSelected,
  enableContextMenu = true,
  showDeleteButton = true,
  onSelect
}) => {
  const theme = useTheme();
  const {
    isDragHovered,
    handleDrag,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleContextMenu,
    handleDelete
  } = useAssetActions(folder);

  return (
    <div
      css={styles(theme)}
      className={`folder-item ${isSelected ? "selected" : ""} ${
        isParent ? "parent" : ""
      } ${isDragHovered ? "drag-hover" : ""}`}
      onClick={onSelect}
      // onDoubleClick={() => handleDoubleClick(folder)}
      onDragStart={handleDrag}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={(e) => handleContextMenu(e, enableContextMenu)}
      draggable
    >
      <FolderIcon className="folder-icon" />
      {isParent && <NorthWest className="parent-icon" />}
      <Typography className="folder-name">{folder.name}</Typography>
      {showDeleteButton && (
        <ButtonGroup className="asset-item-actions" size="small">
          <DeleteButton<Asset>
            className="asset-delete"
            item={folder}
            onClick={() => handleDelete()}
          />
        </ButtonGroup>
      )}
    </div>
  );
};

export default FolderItem;
