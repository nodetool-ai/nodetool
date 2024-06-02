/** @jsxImportSource @emotion/react */
import React, { useEffect } from "react";
import { useState, useCallback, DragEvent } from "react";
import { ButtonGroup } from "@mui/material";
import { Typography } from "@mui/material";
// icons
import FolderIcon from "@mui/icons-material/Folder";
import NorthWest from "@mui/icons-material/NorthWest";
import ImageIcon from "@mui/icons-material/Image";
import VideoFileIcon from "@mui/icons-material/VideoFile";
import AudioFileIcon from "@mui/icons-material/AudioFile";
import TextSnippetIcon from "@mui/icons-material/TextSnippet";
// store
import useSessionStateStore from "../../stores/SessionStateStore";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useAssetStore } from "../../hooks/AssetStore";
// components
import { Asset } from "../../stores/ApiTypes";
import AssetViewer from "./AssetViewer";
import DeleteButton from "../buttons/DeleteButton";
// utils
import { devError } from "../../utils/DevLog";
import { css } from "@emotion/react";
import { useAssetUpdate } from "../../serverState/useAssetUpdate";
import { secondsToHMS } from "../../utils/formatDateAndTime";
import { useSettingsStore } from "../../stores/SettingsStore";

const styles = (theme: any) =>
  css({
    "&": {
      width: "100%",
      height: "100%",
      cursor: "grab",
      position: "relative",
      minHeight: "30px",
      padding: "2px",
      overflow: "hidden",
      boxSizing: "border-box",
      WebkitBoxSizing: "border-box",
      MozBoxSizing: "border-box"
    },
    ".asset": {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: 0,
      paddingTop: "100%",
      backgroundColor: theme.palette.c_gray0,
      zIndex: 0,
      overflow: "hidden"
    },
    ".asset .image, .asset .image-aspect-ratio": {
      position: "absolute",
      top: 0,
      width: "100%",
      height: "100%",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      transition: "opacity 0.5s"
    },
    ".asset .image-aspect-ratio": {
      opacity: 0,
      backgroundSize: "contain",
      backgroundColor: theme.palette.c_gray1
    },
    "&:hover .asset .image": {
      opacity: 1
    },
    "&:hover .asset .image-aspect-ratio": {
      opacity: 1
    },
    "& svg.placeholder": {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 0,
      color: theme.palette.c_gray4
    },
    p: {
      fontSize: theme.fontSizeTiny,
      color: theme.palette.c_white,
      lineHeight: "0.95em",
      margin: "2px 0 4px 2px"
    },
    ".info": {
      position: "absolute",
      pointerEvents: "none",
      fontSize: theme.fontSizeTiny,
      color: theme.palette.c_white,
      backgroundColor: "#11111188",
      margin: "0",
      padding: "0.2em 0.5em",
      wordBreak: "break-word",
      width: "fit-content"
    },
    ".name": {
      top: "calc(100% - 2.5em)",
      transition: "opacity 0.2s",
      maxHeight: "3em",
      overflow: "hidden",
      backgroundColor: "transparent",
      // zIndex: 5000
    },
    ".filetype": {
      top: "0",
      fontWeight: "bold"
    },
    ".duration": {
      bottom: "2px",
      right: "0.25em",
      color: "white"
    },
    "img, video": {
      position: "absolute",
      top: "50% !important",
      left: "50% !important",
      width: "100%",
      height: "auto",
      maxHeight: "unset",
      transform: "translate(-50%, -50%)",
      objectFit: "cover"
    },
    "&.text": {
      minHeight: "80px"
    },
    ".MuiButtonGroup-root": {
      position: "absolute",
      top: 0,
      right: 0
    },
    ".asset-item-actions button": {
      zIndex: 10,
      border: 0,
      minWidth: 0,
      minHeight: 0,
      width: "2em",
      height: "2em",
      margin: "0.1em",
      padding: "0 0.1em",
      borderRadius: "0em !important",
      backgroundColor: "transparent"
    },
    ".asset-delete": {
      pointerEvents: "none",
      opacity: 0
    },
    "&.selected:hover .asset-delete": {
      backgroundColor: "transparent",
      pointerEvents: "all",
      opacity: 1
    },
    "&.image": {
      background: "transparent",
      backgroundRepeat: "no-repeat",
      backgroundSize: "cover",
      overflow: "hidden"
    },
    "&.image img": {
      backgroundColor: theme.palette.c_gray1,
      width: "100%",
      height: "auto",
      fontSize: theme.fontSizeSmaller
    },
    // ITEM
    "&.selected:after": {
      border: `4px solid ${theme.palette.c_gray0}`,
      outline: `8px solid ${theme.palette.c_hl1}`,
      backgroundColor: "#11111155",
      outlineOffset: "-2px",
      borderRadius: "7px",
      zIndex: 2000
    },
    "&:after": {
      content: '""',
      position: "absolute",
      pointerEvents: "none",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 100
    },
    "&:hover:after": {
      border: `2px solid ${theme.palette.c_gray2}`,
      backgroundColor: "#437cb522"
    },
    // FOLDER
    "&.folder .asset": {
      backgroundColor: "transparent",
      border: 0,
      outline: 0
    },
    "&.folder .name": {
      fontSize: theme.fontSizeSmaller,
      color: "#111",
      paddingLeft: ".75em",
      top: "2.5em",
      bottom: "unset"
    },
    "&.folder:hover": {
      opacity: 0.7
    },
    "&.folder::after": {
      backgroundColor: "transparent",
      padding: "2em"
    },
    "&.folder:after, &.folder.selected:after": {
      border: 0,
      outline: 0,
      backgroundColor: "transparent"
    },
    "&.folder svg": {
      position: "absolute",
      margin: 0,
      left: "-5%",
      top: "-5%",
      width: "110%",
      height: "110%",
      bottom: "1em",
      color: theme.palette.c_gray5,
      background: "transparent"
    },
    "&.folder.selected svg": {
      color: theme.palette.c_hl1
    },
    // PARENT FOLDER
    "&.folder.parent": {
      cursor: "pointer"
    },
    "&.folder.parent .name": {
      fontSize: theme.fontSizeSmaller
      // color: "#999 !important",
      // padding: 0,
      // top: "2.5em",
      // bottom: "unset"
    },
    "&.folder.parent svg.parent-icon": {
      color: theme.palette.c_gray6,
      backgroundColor: "transparent",
      width: "40%",
      height: "40%",
      bottom: "20%",
      top: "unset",
      right: "5px",
      left: "unset"
    },
    // FOLDER UP BUTTON
    ".folder-up-button.enabled": {
      color: theme.palette.c_hl1
    },
    ".folder-up-button.disabled": {
      color: "gray"
    },
    // DRAG HOVER
    "&.drag-hover": {
      opacity: 0.7
    },
    // ASSET MISSING
    ".asset-missing": {
      position: "absolute",
      zIndex: 10000,
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      padding: "2em",
      textAlign: "center",
      lineHeight: "1.1em",
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.c_error,
      borderBottom: "1px solid" + theme.palette.c_error,
      width: "100%",
      height: "100%"
    }
  });

export type AssetItemProps = {
  asset: Asset;
  draggable?: boolean;
  isParent?: boolean;
  isSelected?: boolean;
  showDeleteButton?: boolean;
  enableContextMenu?: boolean;
  showName?: boolean;
  showInfo?: boolean;
  showFiletype?: boolean;
  showDuration?: boolean;
  openDeleteDialog?: () => void;
  openRenameDialog?: () => void;
  onSelect?: () => void;
  onDoubleClickFolder?: (id: string) => void;
  onClickParent?: (id: string) => void;
  // onDragStart?: () => string[];
  onDragStart?: (assetId: string) => string[];
  onMoveToFolder?: () => void;
  onDeleteAssets?: () => void;
  onSetCurrentAudioAsset?: (asset: Asset) => void;
};

const AssetItem: React.FC<AssetItemProps> = (props) => {
  const {
    asset,
    draggable = true,
    isParent,
    isSelected,
    showDeleteButton = true,
    enableContextMenu = true,
    showName = true,
    showInfo = true,
    showFiletype = true,
    showDuration = true,
    openDeleteDialog,
    onSelect,
    onDoubleClickFolder,
    onClickParent,
    onMoveToFolder
  } = props;

  const assetType = asset.content_type.split("/")[0];
  const assetFileEnding = asset.content_type.split("/")[1];
  const isImage = asset.content_type.match("image") !== null;
  const isText = asset.content_type.match("text") !== null;
  const isAudio = asset.content_type.match("audio") !== null;
  const isVideo = asset.content_type.match("video") !== null;
  const isFolder = asset.content_type.match("folder") !== null;
  const [isDragHovered, setIsDragHovered] = useState(false);
  const { openContextMenu } = useContextMenuStore();

  const { selectedAssetIds, setSelectedAssetIds } = useSessionStateStore();
  const [openAsset, setOpenAsset] = useState<Asset | undefined>(undefined);
  const [assetItemSize] = useSettingsStore((state) => [
    state.settings.assetItemSize
  ]);
  const handleDelete = useCallback(() => {
    if (selectedAssetIds?.length === 0) {
      setSelectedAssetIds([asset.id]);
    }
    if (openDeleteDialog) {
      openDeleteDialog();
    }
  }, [
    selectedAssetIds?.length,
    openDeleteDialog,
    setSelectedAssetIds,
    asset.id
  ]);

  const { mutation: updateAssetMutation } = useAssetUpdate();

  const moveAssets = useCallback(
    async (assets: string[], parentId: string) => {
      updateAssetMutation.mutateAsync(
        assets.map((id) => ({ id, parent_id: parentId }))
      );
    },
    [updateAssetMutation]
  );

  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const assetData = event.dataTransfer.getData("selectedAssetIds");

      try {
        const selectedAssetIds = JSON.parse(assetData);
        // Move assets to folder
        if (asset.content_type === "folder") {
          await moveAssets(selectedAssetIds, asset.id);
          onMoveToFolder && onMoveToFolder();
        }
      } catch (error) {
        devError("Invalid JSON string:", assetData);
      }
    },
    [asset.content_type, asset.id, moveAssets, onMoveToFolder]
  );

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDrag = useCallback(
    (e: DragEvent) => {
      let assetIds;

      // Check if the current asset's ID is in the selectedAssetIds array
      if (selectedAssetIds && selectedAssetIds.includes(asset.id)) {
        // If yes, use the existing selectedAssetIds
        assetIds = selectedAssetIds;
      } else {
        // If not, reset the selection to only include the current asset's ID
        assetIds = [asset.id];
        setSelectedAssetIds(assetIds);
      }

      // Set data for the drag operation
      e.dataTransfer.setData("selectedAssetIds", JSON.stringify(assetIds));
      e.dataTransfer.setData("asset", JSON.stringify(asset));

      // Create and configure the drag image
      const dragImage = document.createElement("div");
      dragImage.textContent = assetIds.length.toString();

      // drag image
      dragImage.style.position = "absolute";
      dragImage.style.top = "-99999px";
      dragImage.style.backgroundColor = "#222";
      dragImage.style.color = "#999";
      dragImage.style.border = "3px solid #333";
      dragImage.style.borderRadius = "4px";
      dragImage.style.height = "40px";
      dragImage.style.width = "40px";
      dragImage.style.display = "flex";
      dragImage.style.alignItems = "center";
      dragImage.style.justifyContent = "center";
      dragImage.style.fontSize = "20px";
      dragImage.style.fontWeight = "bold";

      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 25, 30);
      setTimeout(() => document.body.removeChild(dragImage), 0);
    },
    [selectedAssetIds, setSelectedAssetIds, asset]
  );

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (isFolder) {
        setIsDragHovered(true);
      }
    },
    [isFolder]
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) {
        setIsDragHovered(false);
      }
    },
    []
  );

  // context menu
  const handleAssetItemContextMenu = useCallback(
    (event: React.MouseEvent, rightClickedAssetId: string) => {
      event.preventDefault();
      event.stopPropagation();
      if (enableContextMenu) {
        // if right clicked asset was not part of an existing selection:
        // change existing selection to only the right clicked asset.
        // as seen in the file explorer in windows and osx
        if (!selectedAssetIds.includes(rightClickedAssetId)) {
          setSelectedAssetIds([rightClickedAssetId]);
        }

        openContextMenu(
          "asset-item-context-menu",
          rightClickedAssetId,
          event.clientX,
          event.clientY
        );
      }
    },

    [selectedAssetIds, setSelectedAssetIds, openContextMenu, enableContextMenu]
  );

  return (
    <div
      css={styles}
      className={`asset-item ${assetType} ${isSelected ? "selected" : ""} ${isDragHovered ? "drag-hover" : ""
        } ${isParent ? "parent" : ""}`}
      onDragEnter={isFolder ? handleDragEnter : undefined}
      onDragLeave={isFolder ? handleDragLeave : undefined}
      onContextMenu={(e) =>
        enableContextMenu
          ? handleAssetItemContextMenu(e, asset.id)
          : e.preventDefault()
      }
      key={asset.id}
      draggable={draggable}
      onDragStart={handleDrag}
      // onClick={onSelect}
      onDoubleClick={() => {
        if (asset.get_url) {
          setOpenAsset(asset);
        }
        if (asset.content_type === "folder") {
          if (onDoubleClickFolder) {
            onDoubleClickFolder(asset.id);
          }
        }
      }}
      onClick={() => {
        if (isParent) {
          onClickParent && onClickParent(asset.id);
        }
        onSelect && onSelect();
      }}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      {showDeleteButton && (
        <ButtonGroup className="asset-item-actions" size="small">
          <DeleteButton<Asset>
            className="asset-delete"
            item={asset}
            onClick={handleDelete}
          />
        </ButtonGroup>
      )}
      <div className="asset">
        {isFolder && (
          <div>
            <FolderIcon className="folder-icon" />
            {isParent && <NorthWest className="parent-icon" />}
          </div>
        )}
        {!asset.get_url && !isFolder && <div className="asset-missing" />}

        {isImage && (
          <>
            <ImageIcon className="placeholder" />
            <div
              className="image"
              style={{
                backgroundImage: `url(${asset.thumb_url || "/images/placeholder.png"
                  })`
              }}
              aria-label={asset.id}
            />
            <div
              className="image-aspect-ratio"
              style={{
                backgroundImage: `url(${asset.thumb_url || "/images/placeholder.png"
                  })`
              }}
              aria-label={asset.id}
            />
          </>
        )}
        {isText && (
          <>
            <TextSnippetIcon className="placeholder" />
          </>
        )}
        {isAudio && (
          <>
            <AudioFileIcon
              style={{ color: `var(--c_${assetType})` }}
              onClick={() => props.onSetCurrentAudioAsset?.(asset)}
              className="placeholder"
            />
            {showDuration && asset.duration && assetItemSize > 1 && (
              <Typography className="duration info">
                {secondsToHMS(asset.duration)}
              </Typography>
            )}
          </>
        )}
        {isVideo && (
          <>
            <VideoFileIcon
              className="placeholder"
              style={{ color: `var(--c_${assetType})`, zIndex: 1000 }}
            />
            <div
              className="image"
              style={{
                backgroundImage: `url(${asset.thumb_url || "/images/placeholder.png"
                  })`
              }}
              aria-label={asset.id}
            />
            {showDuration && asset.duration && assetItemSize > 1 && (
              <Typography className="duration info">
                {secondsToHMS(asset.duration)}
              </Typography>
            )}
          </>
        )}
      </div>
      {showInfo && (
        <>
          {showFiletype && assetFileEnding && assetItemSize > 2 && (
            <Typography
              className="filetype info"
              style={{
                borderLeft: `2px solid var(--c_${assetType})`,
                color: "white",
                backgroundColor: "#333"
              }}
            >
              {assetFileEnding}
            </Typography>
          )}

          {((showName && assetItemSize > 1) || isFolder) && (
            <Typography
              aria-label={asset.name}
              data-microtip-position="bottom"
              role="tooltip"
              className="name info"
            >
              {asset.name}
            </Typography>
          )}
        </>
      )}
      {openAsset && (
        <AssetViewer
          asset={openAsset}
          open={openAsset !== undefined}
          onClose={() => setOpenAsset(undefined)}
        />
      )}
    </div>
  );
};

export default AssetItem;
