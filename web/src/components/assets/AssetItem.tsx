/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useState, useCallback, useMemo } from "react";
import { ButtonGroup, Typography } from "@mui/material";
import FolderIcon from "@mui/icons-material/Folder";
import NorthWest from "@mui/icons-material/NorthWest";
import ImageIcon from "@mui/icons-material/Image";
import VideoFileIcon from "@mui/icons-material/VideoFile";
import AudioFileIcon from "@mui/icons-material/AudioFile";
import TextSnippetIcon from "@mui/icons-material/TextSnippet";
import useSessionStateStore from "../../stores/SessionStateStore";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { Asset } from "../../stores/ApiTypes";
import AssetViewer from "./AssetViewer";
import DeleteButton from "../buttons/DeleteButton";
import { devError } from "../../utils/DevLog";
import { useAssetUpdate } from "../../serverState/useAssetUpdate";
import { secondsToHMS } from "../../utils/formatDateAndTime";
import { useSettingsStore } from "../../stores/SettingsStore";

const styles = (theme: any) =>
  css({
    "&": {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      gap: ".2em",
      overflow: "hidden",
      width: "100%",
      height: "100%",
      cursor: "grab",
      minHeight: "30px",
      boxSizing: "border-box",
      WebkitBoxSizing: "border-box",
      MozBoxSizing: "border-box"
    },
    ".asset": {
      position: "relative",
      width: "100%",
      height: "0",
      paddingBottom: "100%",
      top: 0,
      bottom: 0,
      backgroundColor: theme.palette.c_gray0,
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
      position: "relative",
      padding: "0 0 0 .5em",
      width: "95%",
      height: "3em",
      overflow: "hidden",
      backgroundColor: "transparent"
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
    "&.asset-item.folder": {
      gap: 0
    },
    "&.folder .asset": {
      backgroundColor: "transparent",
      border: 0,
      outline: 0,
      gap: 0
    },
    "&.folder .name": {},
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
      left: "0",
      top: "0",
      transform: "scale(1.1)",
      width: "100%",
      height: "100%",
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
      zIndex: 100,
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
  onDragStart?: (assetId: string) => string[];
  onMoveToFolder?: () => void;
  onDeleteAssets?: () => void;
  onSetCurrentAudioAsset?: (asset: Asset) => void;
};

const AssetItem: React.FC<AssetItemProps> = React.memo((props) => {
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
    onMoveToFolder,
    onSetCurrentAudioAsset
  } = props;

  const [isDragHovered, setIsDragHovered] = useState(false);
  const [openAsset, setOpenAsset] = useState<Asset | undefined>(undefined);

  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const selectedAssetIds = useSessionStateStore(
    (state) => state.selectedAssetIds
  );
  const setSelectedAssetIds = useSessionStateStore(
    (state) => state.setSelectedAssetIds
  );
  const assetItemSize = useSettingsStore(
    (state) => state.settings.assetItemSize
  );

  const { mutation: updateAssetMutation } = useAssetUpdate();

  const assetType = useMemo(() => {
    return asset?.content_type ? asset.content_type.split("/")[0] : "unknown";
  }, [asset?.content_type]);

  const assetFileEnding = useMemo(() => {
    return asset?.content_type ? asset.content_type.split("/")[1] : "unknown";
  }, [asset?.content_type]);

  const isImage = useMemo(
    () => asset?.content_type?.match("image") !== null,
    [asset?.content_type]
  );
  const isText = useMemo(
    () => asset?.content_type?.match("text") !== null,
    [asset?.content_type]
  );
  const isAudio = useMemo(
    () => asset?.content_type?.match("audio") !== null,
    [asset?.content_type]
  );
  const isVideo = useMemo(
    () => asset?.content_type?.match("video") !== null,
    [asset?.content_type]
  );
  const isFolder = useMemo(
    () => asset?.content_type?.match("folder") !== null,
    [asset?.content_type]
  );

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

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleDrag = useCallback(
    (e: React.DragEvent) => {
      let assetIds;

      if (selectedAssetIds && selectedAssetIds.includes(asset.id)) {
        assetIds = selectedAssetIds;
      } else {
        assetIds = [asset.id];
        setSelectedAssetIds(assetIds);
      }

      e.dataTransfer.setData("selectedAssetIds", JSON.stringify(assetIds));
      e.dataTransfer.setData("asset", JSON.stringify(asset));

      const dragImage = document.createElement("div");
      dragImage.textContent = assetIds.length.toString();
      dragImage.style.cssText = `
        position: absolute;
        top: -99999px;
        background-color: #222;
        color: #999;
        border: 3px solid #333;
        border-radius: 4px;
        height: 40px;
        width: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        font-weight: bold;
      `;

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

  const handleAssetItemContextMenu = useCallback(
    (event: React.MouseEvent, rightClickedAssetId: string) => {
      event.preventDefault();
      event.stopPropagation();
      if (enableContextMenu) {
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

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (asset.get_url) {
        setOpenAsset(asset);
      }
      if (asset.content_type === "folder") {
        if (onDoubleClickFolder) {
          onDoubleClickFolder(asset.id);
        }
      }
    },
    [asset, onDoubleClickFolder]
  );

  const handleClick = useCallback(() => {
    if (isParent) {
      onClickParent && onClickParent(asset.id);
    }
    onSelect && onSelect();
  }, [isParent, onClickParent, onSelect, asset.id]);

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
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
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
              onClick={() => onSetCurrentAudioAsset?.(asset)}
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
});

AssetItem.displayName = "AssetItem";

export default AssetItem;
