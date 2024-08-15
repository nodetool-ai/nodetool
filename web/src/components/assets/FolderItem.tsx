/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback } from "react";
import FolderIcon from "@mui/icons-material/Folder";
import NorthWest from "@mui/icons-material/NorthWest";
import { ButtonGroup, Typography } from "@mui/material";
import { Asset } from "../../stores/ApiTypes";
import { useAssetActions } from "./useAssetActions";
import DeleteButton from "../buttons/DeleteButton";
import { useAssetStore } from "../../stores/AssetStore";
import useSessionStateStore from "../../stores/SessionStateStore";
import useAssets from "../../serverState/useAssets";
import { useAssetSelection } from "../../hooks/assets/useAssetSelection";

const styles = (theme: any) =>
  css({
    "&": {
      position: "relative",
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "start",
      padding: "0.5em 0",
      gap: "0.5em",
      width: "100%",
      height: "35px",
      cursor: "pointer",
      boxSizing: "border-box",
      backgroundColor: theme.palette.c_gray1,
      transition: "background-color 0.3s ease",
    },
    ".folder-icon": {
      width: "25px",
      height: "100%",
      left: "0",
      color: theme.palette.c_gray5,
    },
    "&.selected .folder-icon": {
      color: theme.palette.c_hl1,
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
    "&.selected .name": {
      color: theme.palette.c_hl1,
    },
    "&:hover": {
      backgroundColor: theme.palette.c_gray2,
    },
    "&:hover .delete-button": {
      opacity: 1,
    },
    "&.drag-hover": {
      backgroundColor: theme.palette.c_gray3,
    },
    ".delete-button": {
      position: "absolute",
      zIndex: 10,
      opacity: 0,
      width: "20px",
      minWidth: "20px",
      height: "20px",
      right: "1em",
      top: "0",
      border: "none",
      color: theme.palette.c_gray4,
    },
    ".delete-button:hover": {
      border: "none",
      color: theme.palette.c_delete,
    },
  });

export interface FolderItemProps {
  folder: Asset;
  // isSelected: boolean;
  isParent?: boolean;
  onSelect: () => void;
  onClickParent?: (id: string) => void;
  enableContextMenu?: boolean;
  showDeleteButton?: boolean;
  openDeleteDialog?: () => void;
}

const FolderItem: React.FC<FolderItemProps> = ({
  folder,
  isParent,
  onSelect,
  onClickParent,
  enableContextMenu = true,
  showDeleteButton = true,
  // openDeleteDialog,
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
  } = useAssetActions(folder);

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

  const { sortedAssets } = useAssets();
  const { selectedAssetIds } = useAssetSelection(sortedAssets);
  const isSelected = selectedAssetIds.includes(folder.id);

  return (
    <div
      css={styles}
      className={`folder-item ${isSelected ? "selected" : ""} ${
        isParent ? "parent" : ""
      } ${isDragHovered ? "drag-hover" : ""}`}
      onClick={() => handleClick(onSelect, onClickParent, isParent)}
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
            onClick={() => handleDelete()}
          />
        </ButtonGroup>
      )}
    </div>
  );
};

export default FolderItem;
