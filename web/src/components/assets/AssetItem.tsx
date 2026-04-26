/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useMemo, useCallback } from "react";
import ImageIcon from "@mui/icons-material/Image";
import VideoFileIcon from "@mui/icons-material/VideoFile";
import AudioFileIcon from "@mui/icons-material/AudioFile";
import TextSnippetIcon from "@mui/icons-material/TextSnippet";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import DataObjectIcon from "@mui/icons-material/DataObject";
import TableChartIcon from "@mui/icons-material/TableChart";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import { Asset } from "../../stores/ApiTypes";
import { DeleteButton, Text } from "../ui_primitives";
import { secondsToHMS } from "../../utils/formatDateAndTime";
import { formatFileSize } from "../../utils/formatUtils";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useAssetActions } from "./useAssetActions";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";


const styles = (theme: Theme) =>
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
      background: `linear-gradient(180deg, rgb(${theme.vars.palette.common.whiteChannel} / 0.045) 0%, rgb(${theme.vars.palette.common.blackChannel} / 0.18) 100%), ${theme.vars.palette.grey[800]}`,
      borderRadius: "0.9em",
      overflow: "hidden",
      contain: "layout style paint",
      border: `1px solid rgb(${theme.vars.palette.common.whiteChannel} / 0.06)`,
      boxShadow: "0 10px 24px rgb(0 0 0 / 0.12)",
      transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease"
    },
    ".asset::after": {
      content: '""',
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      background: "linear-gradient(180deg, rgb(255 255 255 / 0.06), transparent 32%)"
    },
    ".asset .image, .asset .image-aspect-ratio": {
      position: "absolute",
      top: 0,
      width: "100%",
      height: "100%",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      transition: "opacity 0.3s, transform 0.35s ease"
    },
    ".asset .image-aspect-ratio": {
      opacity: 0,
      backgroundSize: "contain",
      backgroundColor: theme.vars.palette.grey[800],
      willChange: "opacity"
    },
    "&:hover .asset": {
      transform: "translateY(-2px)",
      boxShadow: "0 16px 30px rgb(0 0 0 / 0.18)",
      borderColor: `rgb(${theme.vars.palette.common.whiteChannel} / 0.1)`
    },
    "&:hover .asset .image": {
      opacity: 1,
      transform: "scale(1.02)"
    },
    "&:hover .asset .image-aspect-ratio": {
      opacity: 1,
      transform: "scale(1.02)"
    },
    "& svg.placeholder": {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 0,
      color: theme.vars.palette.grey[400],
      opacity: 0.6,
      fontSize: "2.5em"
    },
    p: {
      fontSize: theme.fontSizeTiny,
      color: theme.vars.palette.grey[0],
      lineHeight: "0.95em",
      margin: "2px 0 4px 2px"
    },
    ".info": {
      position: "absolute",
      pointerEvents: "none",
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[0],
      backgroundColor: `rgba(${theme.vars.palette.grey[900]} / 0.53)`,
      margin: "0",
      padding: "0.2em 0.5em",
      wordBreak: "break-word",
      width: "fit-content"
    },
    ".name": {
      position: "relative",
      padding: "0.2em 0.35em 0 0.35em",
      width: "100%",
      height: "3.2em",
      overflow: "hidden",
      backgroundColor: "transparent",
      textAlign: "center",
      color: theme.vars.palette.grey[100]
    },
    ".name.large": {
      fontSize: theme.fontSizeSmall,
      lineHeight: "1.25em",
      height: "5em",
      marginTop: ".25em"
    },
    ".filetype": {
      top: "0"
    },
    ".filesize": {
      top: "1.6em",
      left: "0.25em",
      color: "white",
      fontSize: theme.fontSizeSmaller
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
      opacity: 0,
      transition: "opacity 0.2s ease"
    },
    "&.selected:hover .asset-delete": {
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
      backgroundColor: theme.vars.palette.grey[800],
      width: "100%",
      height: "auto",
      fontSize: theme.fontSizeSmaller
    },
    // ITEM
    "&.selected:after": {
      border: `2px solid rgb(${theme.vars.palette.common.blackChannel} / 0.55)`,
      outline: `2px solid ${"var(--palette-primary-main)"}`,
      background: `linear-gradient(180deg, rgb(${theme.vars.palette.primary.mainChannel} / 0.12), rgb(${theme.vars.palette.primary.mainChannel} / 0.04))`,
      outlineOffset: "-1px",
      borderRadius: "1em",
      zIndex: 2000,
      boxShadow: `inset 0 1px 0 rgb(${theme.vars.palette.common.whiteChannel} / 0.08)`
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
      border: `1px solid rgb(${theme.vars.palette.common.whiteChannel} / 0.12)`,
      background: `linear-gradient(180deg, rgb(${theme.vars.palette.info.mainChannel} / 0.1), rgb(${theme.vars.palette.info.mainChannel} / 0.04))`,
      borderRadius: "1em"
    },
    // FOLDER UP BUTTON
    ".folder-up-button.enabled": {
      color: "var(--palette-primary-main)"
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
      color: theme.vars.palette.error.main,
      borderBottom: "1px solid" + theme.vars.palette.error.main,
      width: "100%",
      height: "100%"
    }
  });

const videoIconOverlayStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  color: "white",
  fontSize: "3em",
  opacity: 0.8,
  filter: "drop-shadow(0px 0px 4px rgba(0,0,0,0.5))",
  zIndex: 10
};

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
  showFileSize?: boolean;
  onSelect?: () => void;
  onClickParent?: (id: string) => void;
  onDragStart?: (assetId: string) => string[];
  onDeleteAssets?: () => void;
  onSetCurrentAudioAsset?: (asset: Asset) => void;
  onDoubleClick?: (asset: Asset) => void;
};

const AssetItem: React.FC<AssetItemProps> = (props) => {
  const theme = useTheme();
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
    showFileSize = true,
    onSelect,
    onDoubleClick,
    onClickParent,
    onSetCurrentAudioAsset
  } = props;

  const assetItemSize = useSettingsStore(
    (state) => state.settings.assetItemSize
  );

  const {
    isDragHovered,
    handleClick,
    // handleDoubleClick,
    handleDrag,
    handleDragEnd,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleContextMenu,
    handleDelete
  } = useAssetActions(asset);

  // Combine related type checks into a single useMemo for better performance
  const {
    assetType,
    assetFileEnding,
    isImage,
    isText,
    isAudio,
    isVideo,
    isPdf,
    isJson,
    isCsv
  } = useMemo(() => {
    const contentType = asset?.content_type || "";
    const name = asset?.name || "";
    const parts = contentType.split("/");

    return {
      assetType: parts[0] || "unknown",
      assetFileEnding: parts[1] || "unknown",
      isImage: contentType.match("image") !== null,
      isText: contentType.match("text") !== null,
      isAudio: contentType.match("audio") !== null,
      isVideo: contentType.match("video") !== null,
      isPdf: contentType.match("pdf") !== null,
      isJson: contentType.includes("json") || name.toLowerCase().endsWith(".json"),
      isCsv: contentType.includes("csv") || name.toLowerCase().endsWith(".csv")
    };
  }, [asset?.content_type, asset?.name]);

  const handleAudioClick = useCallback(() => {
    onSetCurrentAudioAsset?.(asset);
  }, [asset, onSetCurrentAudioAsset]);

  // Memoize click handler to prevent unnecessary re-renders
  const handleItemClick = useCallback(() => {
    handleClick(onSelect, onClickParent, isParent);
  }, [handleClick, onSelect, onClickParent, isParent]);

  const handleDoubleClickWithStop = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDoubleClick) {
      onDoubleClick(asset);
    }
  }, [onDoubleClick, asset]);

  const result = (
    <div
      css={styles(theme)}
      className={`asset-item ${assetType} ${isSelected ? "selected" : ""} ${isDragHovered ? "drag-hover" : ""
        } ${isParent ? "parent" : ""}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onContextMenu={(e) => handleContextMenu(e, enableContextMenu)}
      key={asset.id}
      draggable={draggable}
      onDragStart={handleDrag}
      onDragEnd={handleDragEnd}
      onDoubleClick={handleDoubleClickWithStop}
      onClick={handleItemClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {showDeleteButton && (
        <div
          css={css({
            position: "absolute",
            top: 4,
            right: 4,
            zIndex: 1000
          })}
        >
          <DeleteButton
            className="asset-delete"
            onClick={handleDelete}
            buttonSize="small"
          />
        </div>
      )}
      <div className={`asset ${isImage ? "alpha-surface" : ""}`}>
        {!asset.get_url && <div className="asset-missing" />}
        {isImage && (
          <>
            {!asset.get_url && <ImageIcon className="placeholder" />}
            {asset.get_url && (
              <>
                <div
                  className="image"
                  style={{
                    backgroundImage: `url(${asset.thumb_url || asset.get_url})`
                  }}
                  aria-label={asset.id}
                />
                <div
                  className="image-aspect-ratio"
                  style={{
                    backgroundImage: `url(${asset.thumb_url || asset.get_url})`
                  }}
                  aria-label={asset.id}
                />
              </>
            )}
          </>
        )}
        {isText && !isJson && !isCsv && (
          <TextSnippetIcon
            className="placeholder"
            titleAccess={asset.content_type || "Text file"}
          />
        )}
        {isAudio && (
          <>
            <AudioFileIcon
              style={{ color: `var(--c_${assetType})` }}
              onClick={handleAudioClick}
              className="placeholder"
              titleAccess={asset.content_type || "Audio file"}
            />
            {showDuration && asset.duration && assetItemSize > 1 && (
              <Text className="duration info">
                {secondsToHMS(asset.duration)}
              </Text>
            )}
          </>
        )}
        {isVideo && (
          <>
            {!asset.thumb_url && !asset.get_url ? (
              <VideoFileIcon
                className="placeholder"
                style={{ color: `var(--c_${assetType})`, zIndex: 1000 }}
                titleAccess={asset.content_type || "Video file"}
              />
            ) : (
              <div
                className="image"
                style={{
                  backgroundImage: `url(${asset.thumb_url || asset.get_url})`
                }}
                aria-label={asset.id}
              />
            )}

            {/* Always show icon overlay for video if we have a thumbnail to indicate it's playble/video */}
            {(asset.thumb_url || asset.get_url) && (
              <VideoFileIcon style={videoIconOverlayStyle} />
            )}

            {showDuration && asset.duration && assetItemSize > 1 && (
              <Text className="duration info">
                {secondsToHMS(asset.duration)}
              </Text>
            )}
          </>
        )}
        {isPdf && (
          <>
            <PictureAsPdfIcon
              className="placeholder"
              style={{ color: `var(--c_${assetType})` }}
              titleAccess={asset.content_type || "PDF file"}
            />
            {asset.get_url !== "/images/placeholder.png" && (
              <div
                className="image"
                style={{
                  backgroundImage: `url(${asset.get_url})`
                }}
                aria-label={asset.id}
              />
            )}
          </>
        )}
        {isJson && (
          <DataObjectIcon
            className="placeholder"
            style={{ color: `var(--c_${assetType})` }}
            titleAccess={asset.content_type || "JSON file"}
          />
        )}
        {isCsv && (
          <TableChartIcon
            className="placeholder"
            style={{ color: `var(--c_${assetType})` }}
            titleAccess={asset.content_type || "CSV file"}
          />
        )}
        {!isImage &&
          !isVideo &&
          !isAudio &&
          !isText &&
          !isPdf &&
          !isJson &&
          !isCsv && (
            <InsertDriveFileIcon
              className="placeholder"
              style={{ color: `var(--c_${assetType})` }}
              titleAccess={asset.content_type || "Unknown file type"}
            />
          )}
      </div>
      {showInfo && (
        <>
          {showFiletype && assetFileEnding && assetItemSize > 3 && (
            <Text
              className="filetype info"
              size="tiny"
              title={asset.content_type || "Unknown content type"}
              style={{
                borderTop: `2px solid var(--c_${assetType})`,
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                textAlign: "center",
                zIndex: 1000,
                color: theme.vars.palette.grey[100],
                backgroundColor: theme.vars.palette.grey[800]
              }}
            >
              {assetFileEnding}
            </Text>
          )}
          {showFileSize &&
            asset.size !== undefined &&
            asset.size !== null &&
            asset.size > 0 &&
            assetItemSize > 3 && (
              <Text
                className="filesize info"
                title={`File size: ${formatFileSize(asset.size)}`}
                style={{
                  color: "white",
                  backgroundColor: "var(--palette-grey-700)"
                }}
              >
                {formatFileSize(asset.size)}
              </Text>
            )}
          {showName && assetItemSize > 2 && (
            <Text
              aria-label={asset.name}
              data-microtip-position="bottom"
              role="tooltip"
              className={`name info ${assetItemSize > 4 ? "large" : ""}`}
            >
              {asset.name}
              {/* {asset.parent_id} */}
            </Text>
          )}
        </>
      )}
    </div>
  );

  return result;
};

// Optimized memo: only re-render when THIS asset's selection state changes
export default memo(AssetItem, (prevProps, nextProps) => {
  // Only re-render if this specific asset's selection state changed
  // or if other relevant props changed
  const selectionChanged = prevProps.isSelected !== nextProps.isSelected;
  const assetChanged = prevProps.asset.id !== nextProps.asset.id;
  const functionsChanged =
    prevProps.onSelect !== nextProps.onSelect ||
    prevProps.onDoubleClick !== nextProps.onDoubleClick;

  const shouldUpdate = selectionChanged || assetChanged || functionsChanged;

  return !shouldUpdate; // memo returns true to skip re-render
});
