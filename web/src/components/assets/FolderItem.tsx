/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { memo } from "react";
import FolderIcon from "@mui/icons-material/Folder";
import NorthWest from "@mui/icons-material/NorthWest";
import { Asset } from "../../stores/ApiTypes";
import { useAssetActions } from "./useAssetActions";
import { DeleteButton, Text } from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

const styles = (theme: Theme) =>
  css({
    "&": {
      position: "relative",
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "start",
      gap: ".4em",
      width: "100%",
      padding: "0.3em 0.5em",
      cursor: "pointer",
      boxSizing: "border-box",
      backgroundColor: "transparent",
      borderRadius: "var(--rounded-md, 6px)",
      transition: "background-color 0.15s ease, color 0.15s ease"
    },
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover
    },
    "&:hover p": {
      color: theme.vars.palette.grey[100]
    },
    "&.selected": {
      backgroundColor:
        "rgba(var(--palette-primary-main-channel) / 0.12)"
    },
    ".folder-icon": {
      width: "20px",
      height: "20px",
      marginLeft: "2px",
      left: 0,
      color: theme.vars.palette.grey[500],
      flexShrink: 0
    },
    ".folder-icon:hover": {
      color: theme.vars.palette.grey[400]
    },
    "&.selected .folder-icon": {
      color: theme.vars.palette.primary.main
    },
    ".parent-icon": {
      position: "absolute",
      color: "var(--c_folder)",
      width: "30%",
      height: "30%",
      bottom: "10%",
      right: "10%"
    },
    ".name, .folder-name": {
      margin: 0,
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      textAlign: "left",
      verticalAlign: "middle",
      wordBreak: "break-word",
      maxWidth: "100%",
      maxHeight: "2.5em",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      color: theme.vars.palette.text.secondary
    },
    "&.selected .name, &.selected .folder-name": {
      color: theme.vars.palette.primary.main,
      fontWeight: 600
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

const FolderItem: React.FC<FolderItemProps> = ({
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

  return (
    <div
      css={styles(theme)}
      className={`folder-item ${isSelected ? "selected" : ""} ${
        isParent ? "parent" : ""
      } ${isDragHovered ? "drag-hover" : ""}`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest(".expand-gutter")) {
          // Let the click bubble to AccordionSummary to toggle expansion
          return;
        }
        e.stopPropagation();
        onSelect();
      }}
      onDragStart={handleDrag}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={(e) => handleContextMenu(e, enableContextMenu)}
      draggable
    >
      <FolderIcon className="folder-icon" />
      {children}
      {isParent && <NorthWest className="parent-icon" />}
      <Text className="folder-name">{folder.name}</Text>
      {showDeleteButton && (
        <DeleteButton
          className="asset-delete"
          onClick={handleDelete}
          buttonSize="small"
        />
      )}
    </div>
  );
};

export default memo(FolderItem);
