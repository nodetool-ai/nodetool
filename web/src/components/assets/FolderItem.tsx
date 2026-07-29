/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { memo, useCallback, useMemo } from "react";
import FolderIcon from "@mui/icons-material/Folder";
import NorthWest from "@mui/icons-material/NorthWest";
import { Asset } from "../../stores/ApiTypes";
import { useAssetActions } from "./useAssetActions";
import { DeleteButton, Text, MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
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
      borderRadius: BORDER_RADIUS.md,
      transition: `${MOTION.background}, color ${MOTION.fast}`
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
      marginLeft: getSpacingPx(SPACING.micro),
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
      transition: `opacity ${MOTION.normal} ${200}ms`
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
  const folderStyles = useMemo(() => styles(theme), [theme]);
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
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Enter" && e.key !== " ") {
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest(".expand-gutter")) {
        // Let the expand button handle its own native activation
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onSelect();
    },
    [onSelect]
  );

  return (
    <div
      css={folderStyles}
      className={`folder-item ${isSelected ? "selected" : ""} ${
        isParent ? "parent" : ""
      } ${isDragHovered ? "drag-hover" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={folder.name}
      onKeyDown={handleKeyDown}
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
