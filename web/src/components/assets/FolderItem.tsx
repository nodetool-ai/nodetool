/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback } from "react";
import FolderIcon from "@mui/icons-material/Folder";
import NorthWest from "@mui/icons-material/NorthWest";
import { ButtonGroup, Typography } from "@mui/material";
import { Asset } from "../../stores/ApiTypes";
import { useAssetActions } from "./useAssetActions";
import DeleteButton from "../buttons/DeleteButton";
import { useAssetStore } from "../../hooks/AssetStore";
import useSessionStateStore from "../../stores/SessionStateStore";

const styles = (theme: any) =>
  css({
    "&": {
      position: "relative",
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "start",
      gap: "0.5em",
      width: "100%",
      height: "25px",
      cursor: "pointer",
      boxSizing: "border-box",
      backgroundColor: theme.palette.c_gray2,
    },
    ".folder-icon": {
      width: "25px",
      height: "100%",
      left: "0",
      color: theme.palette.c_gray5,
    },
    ".parent-icon": {
      position: "absolute",
      color: theme.palette.c_gray6,
      width: "30%",
      height: "30%",
      bottom: "10%",
      right: "10%",
    },
    ".name": {
      marginTop: "0.5em",
      fontSize: theme.fontSizeSmaller,
      textAlign: "center",
      wordBreak: "break-word",
      maxWidth: "100%",
    },
    "&:hover": {
      opacity: 0.6,
    },
    "&.selected:after": {
      content: '""',
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      border: `2px solid ${theme.palette.c_hl1}`,
      borderRadius: "4px",
    },
    "&.drag-hover": {
      backgroundColor: theme.palette.c_gray3,
    },
    ".delete-button": {
      position: "absolute",
      width: "20px",
      minWidth: "20px",
      height: "20px",
      right: "1em",
      top: "0",
    },
  });

export interface FolderItemProps {
  folder: Asset;
  isSelected: boolean;
  isParent?: boolean;
  onSelect: () => void;
  onDoubleClick: (id: string) => void;
  onMoveToFolder?: () => void;
  enableContextMenu?: boolean;
  showDeleteButton?: boolean;
  openDeleteDialog?: () => void;
}

const FolderItem: React.FC<FolderItemProps> = ({
  folder,
  isSelected,
  isParent,
  onSelect,
  onDoubleClick,
  onMoveToFolder,
  enableContextMenu = true,
  showDeleteButton = true,
  openDeleteDialog,
}) => {
  const {
    isDragHovered,
    handleClick,

    handleDrag,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleContextMenu,
    handleDelete,
  } = useAssetActions(folder, onMoveToFolder);

  const setSelectedAssetIds = useSessionStateStore(
    (state) => state.setSelectedAssetIds
  );
  const setCurrentFolderId = useAssetStore((state) => state.setCurrentFolderId);
  const handleDoubleClick = useCallback(
    (asset: Asset) => {
      setCurrentFolderId(asset.id);
      setSelectedAssetIds([]);
    },
    [setCurrentFolderId, setSelectedAssetIds]
  );

  return (
    <div
      css={styles}
      className={`folder-item ${isSelected ? "selected" : ""} ${
        isParent ? "parent" : ""
      } ${isDragHovered ? "drag-hover" : ""}`}
      onClick={() => handleClick(onSelect, undefined, isParent)}
      onDoubleClick={() => handleDoubleClick(folder)}
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
      <Typography className="name">{folder.name}</Typography>
      {showDeleteButton && (
        <ButtonGroup className="asset-item-actions" size="small">
          <DeleteButton<Asset>
            className="asset-delete"
            item={folder}
            onClick={() => handleDelete(openDeleteDialog)}
          />
        </ButtonGroup>
      )}
    </div>
  );
};

export default FolderItem;
