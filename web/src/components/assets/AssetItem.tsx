/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useMemo } from "react";
import { ButtonGroup, Typography } from "@mui/material";
import ImageIcon from "@mui/icons-material/Image";
import VideoFileIcon from "@mui/icons-material/VideoFile";
import AudioFileIcon from "@mui/icons-material/AudioFile";
import TextSnippetIcon from "@mui/icons-material/TextSnippet";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import DataObjectIcon from "@mui/icons-material/DataObject";
import TableChartIcon from "@mui/icons-material/TableChart";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import { Asset } from "../../stores/ApiTypes";
import DeleteButton from "../buttons/DeleteButton";
import { secondsToHMS } from "../../utils/formatDateAndTime";
import { formatFileSize } from "../../utils/formatUtils";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useAssetActions } from "./useAssetActions";

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
      backgroundColor: "var(--c_gray0)",
      borderRadius: "0.5em",
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
      backgroundColor: theme.palette.grey[800]
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
      color: theme.palette.grey[400],
      opacity: 0.6,
      fontSize: "2.5em"
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
      fontSize: theme.fontSizeSmaller,
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
      backgroundColor: "transparent",
      textAlign: "center"
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
      backgroundColor: theme.palette.grey[800],
      width: "100%",
      height: "auto",
      fontSize: theme.fontSizeSmaller
    },
    // ITEM
    "&.selected:after": {
      border: `4px solid ${theme.palette.grey[900]}`,
      outline: `8px solid ${theme.palette.c_hl1}`,
      backgroundColor: "#11111155",
      outlineOffset: "-2px",
      borderRadius: ".75em",
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
      border: `2px solid ${theme.palette.grey[600]}`,
      backgroundColor: "#437cb522"
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
  showFileSize?: boolean;
  onSelect?: () => void;
  onClickParent?: (id: string) => void;
  onDragStart?: (assetId: string) => string[];
  onDeleteAssets?: () => void;
  onSetCurrentAudioAsset?: (asset: Asset) => void;
  onDoubleClick?: (asset: Asset) => void;
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
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleContextMenu,
    handleDelete
  } = useAssetActions(asset);

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
  const isPdf = useMemo(
    () => asset?.content_type?.match("pdf") !== null,
    [asset?.content_type]
  );
  const isJson = useMemo(
    () =>
      asset?.content_type?.includes("json") ||
      asset?.name?.toLowerCase().endsWith(".json"),
    [asset?.content_type, asset?.name]
  );
  const isCsv = useMemo(
    () =>
      asset?.content_type?.includes("csv") ||
      asset?.name?.toLowerCase().endsWith(".csv"),
    [asset?.content_type, asset?.name]
  );

  const result = (
    <div
      css={styles}
      className={`asset-item ${assetType} ${isSelected ? "selected" : ""} ${
        isDragHovered ? "drag-hover" : ""
      } ${isParent ? "parent" : ""}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onContextMenu={(e) => handleContextMenu(e, enableContextMenu)}
      key={asset.id}
      draggable={draggable}
      onDragStart={handleDrag}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (onDoubleClick) {
          onDoubleClick(asset);
        }
      }}
      onClick={() => handleClick(onSelect, onClickParent, isParent)}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {showDeleteButton && (
        <ButtonGroup className="asset-item-actions" size="small" tabIndex={-1}>
          <DeleteButton<Asset>
            className="asset-delete"
            item={asset}
            onClick={() => handleDelete()}
          />
        </ButtonGroup>
      )}
      <div className="asset">
        {!asset.get_url && <div className="asset-missing" />}
        {isImage && (
          <>
            {!asset.get_url && <ImageIcon className="placeholder" />}
            {asset.get_url && (
              <>
                <div
                  className="image"
                  style={{
                    backgroundImage: `url(${asset.get_url})`
                  }}
                  aria-label={asset.id}
                />
                <div
                  className="image-aspect-ratio"
                  style={{
                    backgroundImage: `url(${asset.get_url})`
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
              onClick={() => onSetCurrentAudioAsset?.(asset)}
              className="placeholder"
              titleAccess={asset.content_type || "Audio file"}
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
              titleAccess={asset.content_type || "Video file"}
            />
            <div
              className="image"
              style={{
                backgroundImage: `url(${asset.get_url})`
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
          {showFiletype && assetFileEnding && assetItemSize > 2 && (
            <Typography
              className="filetype info"
              title={asset.content_type || "Unknown content type"}
              style={{
                borderLeft: `2px solid var(--c_${assetType})`,
                color: "white",
                backgroundColor: "#333"
              }}
            >
              {assetFileEnding}
            </Typography>
          )}
          {showFileSize &&
            (asset as any).size !== undefined &&
            (asset as any).size > 0 &&
            assetItemSize > 2 && (
              <Typography
                className="filesize info"
                title={`File size: ${formatFileSize((asset as any).size)}`}
                style={{
                  color: "white",
                  backgroundColor: "#333aa"
                }}
              >
                {formatFileSize((asset as any).size)}
              </Typography>
            )}
          {showName && assetItemSize > 1 && (
            <Typography
              aria-label={asset.name}
              data-microtip-position="bottom"
              role="tooltip"
              className={`name info ${assetItemSize > 4 ? "large" : ""}`}
            >
              {asset.name}
              {/* {asset.parent_id} */}
            </Typography>
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
