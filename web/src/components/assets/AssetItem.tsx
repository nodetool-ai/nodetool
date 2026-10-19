/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import ImageIcon from "@mui/icons-material/Image";
import VideoFileIcon from "@mui/icons-material/VideoFile";
import AudioFileIcon from "@mui/icons-material/AudioFile";
import TextSnippetIcon from "@mui/icons-material/TextSnippet";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import DataObjectIcon from "@mui/icons-material/DataObject";
import TableChartIcon from "@mui/icons-material/TableChart";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import { Asset } from "../../stores/ApiTypes";
import {
  DeleteButton,
  FavoriteButton,
  StatusPill,
  Text,
  MOTION,
  BORDER_RADIUS,
  FONT_WEIGHT,
  SHADOW,
  SPACING,
  getSpacingPx,
  Z_INDEX,
  focusRing,
  reducedMotion,
  selectedTileStyles
} from "../ui_primitives";
import { secondsToHMS } from "../../utils/formatDateAndTime";
import { formatFileSize } from "../../utils/formatUtils";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useAssetActions } from "./useAssetActions";
import { useSetAssetFavorite } from "../../serverState/useAssetFavorite";
import { useActivateOnKey } from "../../hooks/useActivateOnKey";
import { useVideoThumbnail } from "../../hooks/useVideoThumbnail";
import { useImageThumbnail } from "../../hooks/useImageThumbnail";
import { isCoarsePointer } from "../../utils/isCoarsePointer";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";


const styles = (theme: Theme) =>
  css({
    "&": {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.xs),
      overflow: "hidden",
      width: "100%",
      height: "100%",
      cursor: "grab",
      minHeight: "30px",
      // Without this a phone waits for a second tap before dispatching the
      // first click, and double-tap zooms the panel instead of opening.
      touchAction: "manipulation",
      borderRadius: BORDER_RADIUS.md,
      boxSizing: "border-box",
      WebkitBoxSizing: "border-box",
      MozBoxSizing: "border-box"
    },
    "&:focus-visible": focusRing(theme, 2),
    ".asset": {
      position: "relative",
      width: "100%",
      height: "0",
      paddingBottom: "100%",
      top: 0,
      bottom: 0,
      background: `linear-gradient(180deg, rgb(${theme.vars.palette.common.whiteChannel} / 0.045) 0%, rgb(${theme.vars.palette.common.blackChannel} / 0.18) 100%), ${theme.vars.palette.grey[800]}`,
      borderRadius: BORDER_RADIUS.md,
      overflow: "hidden",
      contain: "layout style paint",
      border: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: "none",
      transition: `${MOTION.shadow}, ${MOTION.border}`,
      ...reducedMotion({ transition: MOTION.none })
    },
    "&.selected .asset": selectedTileStyles(theme),
    "&.selected::before": {
      content: '""',
      position: "absolute",
      top: "0.6em",
      right: "0.6em",
      width: "1.4em",
      height: "1.4em",
      borderRadius: BORDER_RADIUS.circle,
      backgroundColor: theme.vars.palette.primary.main,
      backgroundImage:
        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'><path d='M9 16.17 4.83 12l-1.41 1.41L9 19 21 7l-1.41-1.41z'/></svg>\")",
      backgroundSize: "70% 70%",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      zIndex: Z_INDEX.raised,
      boxShadow: SHADOW(theme).sm
    },
    ".asset::after": {
      content: '""',
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      background: `linear-gradient(180deg, ${theme.vars.palette.c_overlay}, transparent 32%)`,
      opacity: 0,
      transition: `${MOTION.background}, ${MOTION.opacity}`,
      ...reducedMotion({ transition: MOTION.none })
    },
    ".asset .image, .asset .image-aspect-ratio": {
      position: "absolute",
      top: 0,
      width: "100%",
      height: "100%",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      transition: `opacity ${MOTION.slow}, transform ${MOTION.slow}`
    },
    ".asset .image-aspect-ratio": {
      opacity: 0,
      backgroundSize: "contain",
      backgroundColor: theme.vars.palette.grey[800],
      willChange: "opacity"
    },
    "&:not(.selected):hover .asset::after": {
      backgroundColor: theme.vars.palette.action.hover
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
      zIndex: Z_INDEX.base,
      color: theme.vars.palette.grey[400],
      opacity: 0.6,
      fontSize: "2.5em"
    },
    p: {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[0],
      lineHeight: "0.95em",
      margin: `${getSpacingPx(SPACING.micro)} 0 ${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.micro)}`
    },
    ".info, .asset-caption, .asset .asset-favorite": {
      opacity: 0,
      transition: MOTION.opacity,
      ...reducedMotion({ transition: MOTION.none })
    },
    "&:hover .info, &:hover .asset-caption, &:hover .asset::after, &:focus-visible .info, &:focus-visible .asset-caption, &:focus-visible .asset::after, &:hover .asset .asset-favorite, &:focus-within .asset .asset-favorite, .asset .asset-favorite.is-favorite":
      {
        opacity: 1
      },
    ".info": {
      position: "absolute",
      pointerEvents: "none",
      fontSize: theme.fontSizeSmaller,
      fontWeight: FONT_WEIGHT.normal,
      letterSpacing: "0.02em",
      color: theme.vars.palette.grey[0],
      margin: "0",
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.md)}`,
      wordBreak: "break-word",
      width: "fit-content"
    },
    ".asset-caption": {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: Z_INDEX.raised,
      pointerEvents: "none",
      // Leaves room for the star in the bottom-right corner.
      padding: `${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.xxxl)} ${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.sm)}`,
      background: `linear-gradient(0deg, ${theme.vars.palette.c_scrim}, transparent)`
    },
    ".name": {
      position: "relative",
      margin: 0,
      width: "100%",
      height: "auto",
      // Clamp to two lines so near-identical names (inpaint-result.png vs
      // inpaint-result-1.png) keep their distinguishing tail instead of being
      // cut to "inpaint-r…" on a single line.
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      wordBreak: "break-word",
      backgroundColor: "transparent",
      textAlign: "left",
      fontSize: theme.fontSizeSmall,
      fontWeight: FONT_WEIGHT.medium,
      lineHeight: "1.25em",
      // Fixed light text: the scrim is dark in both schemes.
      color: theme.vars.palette.common.white
    },
    ".name.large": {
      fontSize: theme.fontSizeSmall,
      lineHeight: "1.25em",
      marginTop: 0
    },
    ".meta": {
      position: "relative",
      margin: `${getSpacingPx(SPACING.micro)} 0 0`,
      width: "100%",
      textAlign: "left",
      fontSize: theme.fontSizeSmaller,
      fontFamily: theme.fontFamily2,
      lineHeight: "1.2em",
      color: `rgb(${theme.vars.palette.common.whiteChannel} / 0.7)`,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".filetype": {
      top: "0.5em",
      left: "0.5em",
      borderTopRightRadius: BORDER_RADIUS.xs,
      borderTopLeftRadius: BORDER_RADIUS.xs,
      backgroundColor: theme.vars.palette.c_scrim,
      backdropFilter: "blur(4px)",
      borderTop: "none !important"
    },
    ".filesize": {
      top: "2em",
      left: "0.5em",
      borderBottomRightRadius: BORDER_RADIUS.xs,
      borderBottomLeftRadius: BORDER_RADIUS.xs,
      backgroundColor: theme.vars.palette.c_scrim,
      backdropFilter: "blur(4px)",
      // Fixed light text: the scrim is dark in both schemes.
      color: theme.vars.palette.common.white,
      fontSize: theme.fontSizeSmaller,
      fontWeight: FONT_WEIGHT.normal
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
      zIndex: Z_INDEX.dropdown,
      border: 0,
      minWidth: 0,
      minHeight: 0,
      width: "2em",
      height: "2em",
      margin: getSpacingPx(SPACING.micro),
      padding: `0 ${getSpacingPx(SPACING.micro)}`,
      borderRadius: "0 !important",
      backgroundColor: "transparent"
    },
    ".asset-favorite": {
      position: "absolute",
      bottom: getSpacingPx(SPACING.micro),
      right: getSpacingPx(SPACING.micro),
      zIndex: Z_INDEX.raised
    },
    ".asset-delete": {
      pointerEvents: "none",
      opacity: 0,
      transition: MOTION.opacity
    },
    "&.selected:hover .asset-delete": {
      pointerEvents: "all",
      opacity: 1
    },
    // A phone keeps :hover on the tile it last tapped, which would leave the
    // delete and star buttons live over the thumbnail, so the next tap acts
    // instead of opening. Touch deletes and stars through the long-press
    // context menu, and a starred tile keeps the star as a marker.
    "@media (pointer: coarse)": {
      ".asset-delete-overlay": {
        display: "none"
      },
      ".asset-favorite": {
        pointerEvents: "none"
      },
      ".asset-favorite:not(.is-favorite)": {
        display: "none"
      }
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
    "&.svg .asset .image, &.svg .asset .image-aspect-ratio": {
      backgroundSize: "contain",
      backgroundColor: theme.vars.palette.grey[800]
    },
    // ITEM
    "&:after": {
      content: '""',
      position: "absolute",
      pointerEvents: "none",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: Z_INDEX.overlay
    },
    // FOLDER UP BUTTON
    ".folder-up-button.enabled": {
      color: theme.vars.palette.primary.main
    },
    ".folder-up-button.disabled": {
      color: theme.vars.palette.text.disabled
    },
    // DRAG HOVER
    "&.drag-hover": {
      opacity: 0.7
    },
    // ASSET MISSING
    ".asset-missing": {
      position: "absolute",
      zIndex: Z_INDEX.overlay,
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      padding: getSpacingPx(SPACING.xxxl),
      textAlign: "center",
      lineHeight: "1.1em",
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.error.main,
      borderBottom: `1px solid ${theme.vars.palette.error.main}`,
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
  /** Star toggle on the thumbnail. Defaults to `enableContextMenu`. */
  showFavoriteButton?: boolean;
  onSelect?: () => void;
  onClickParent?: (id: string) => void;
  onDragStart?: (assetId: string) => string[];
  onSetCurrentAudioAsset?: (asset: Asset) => void;
  onDoubleClick?: (asset: Asset) => void;
};

const deleteButtonOverlayStyle = css({
  position: "absolute",
  top: 4,
  right: 4,
  zIndex: Z_INDEX.raised
});

const AssetItem: React.FC<AssetItemProps> = (props) => {
  const { t } = useTranslation("translation", {
    keyPrefix: "i18n-next42-assets-grid"
  });
  const theme = useTheme();
  const assetStyles = useMemo(() => styles(theme), [theme]);
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
    showFavoriteButton = enableContextMenu,
    onSelect,
    onDoubleClick,
    onClickParent,
    onSetCurrentAudioAsset
  } = props;

  const assetItemSize = useSettingsStore(
    (state) => state.settings.assetItemSize
  );
  const assetsOrder = useSettingsStore(
    (state) => state.settings.assetsOrder
  );

  const {
    isDragHovered,
    handleClick,
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
    isSvg,
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
      isSvg:
        contentType === "image/svg+xml" || name.toLowerCase().endsWith(".svg"),
      isImage:
        contentType.match("image") !== null ||
        name.toLowerCase().endsWith(".svg"),
      isText: contentType.match("text") !== null,
      isAudio: contentType.match("audio") !== null,
      isVideo: contentType.match("video") !== null,
      isPdf: contentType.match("pdf") !== null,
      isJson: contentType.includes("json") || name.toLowerCase().endsWith(".json"),
      isCsv: contentType.includes("csv") || name.toLowerCase().endsWith(".csv")
    };
  }, [asset?.content_type, asset?.name]);

  // Videos have no paintable fallback: `get_url` is an MP4, which no browser
  // renders as a background image. When the server thumbnail is missing the
  // tile used to come up empty, so decode a poster frame in the browser.
  const videoThumbUrl = useVideoThumbnail(
    isVideo ? asset?.thumb_url : null,
    isVideo ? asset?.get_url : null
  );

  // A fresh upload can be listed before its thumbnail is written. The hook
  // shows the full image until the thumbnail loads, instead of a black tile.
  const rasterThumbUrl = useImageThumbnail(
    isImage && !isSvg ? asset?.thumb_url : null,
    isImage && !isSvg ? asset?.get_url : null
  );
  const imageUrl = isSvg ? asset.get_url : rasterThumbUrl;

  const metaLine = [
    assetsOrder === "date" && asset.created_at && assetItemSize > 2
      ? new Date(asset.created_at).toLocaleDateString()
      : null,
    showDuration && asset.duration ? secondsToHMS(asset.duration) : null
  ]
    .filter(Boolean)
    .join(" · ");

  const handleAudioClick = useCallback(() => {
    onSetCurrentAudioAsset?.(asset);
  }, [asset, onSetCurrentAudioAsset]);

  // Memoize click handler to prevent unnecessary re-renders
  const handleItemClick = useCallback(() => {
    handleClick(onSelect, onClickParent, isParent);
    // Touch has no reliable dblclick, so a tap has to both select and open.
    if (!isParent && isCoarsePointer()) {
      onDoubleClick?.(asset);
    }
  }, [handleClick, onSelect, onClickParent, isParent, onDoubleClick, asset]);

  const handleItemKeyDown = useActivateOnKey(handleItemClick);

  const setAssetFavorite = useSetAssetFavorite();
  const handleToggleFavorite = useCallback(
    (favorite: boolean) => setAssetFavorite([asset.id], favorite),
    [setAssetFavorite, asset.id]
  );

  const handleDoubleClickWithStop = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDoubleClick) {
      onDoubleClick(asset);
    }
  }, [onDoubleClick, asset]);

  const result = (
    <div
      css={assetStyles}
      className={`asset-item ${assetType}${isSvg ? " svg" : ""} ${isSelected ? "selected" : ""} ${isDragHovered ? "drag-hover" : ""
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
      role="button"
      tabIndex={0}
      aria-label={asset.name}
      onKeyDown={handleItemKeyDown}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {showDeleteButton && (
        <div className="asset-delete-overlay" css={deleteButtonOverlayStyle}>
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
                    backgroundImage: `url(${imageUrl})`
                  }}
                  aria-label={asset.id}
                />
                <div
                  className="image-aspect-ratio"
                  style={{
                    backgroundImage: `url(${imageUrl})`
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
            titleAccess={asset.content_type || t("fileTypes.text")}
          />
        )}
        {isAudio && (
          <AudioFileIcon
            style={{ color: `var(--c_${assetType})` }}
            onClick={handleAudioClick}
            className="placeholder"
            titleAccess={asset.content_type || t("fileTypes.audio")}
          />
        )}
        {isVideo && (
          <>
            {videoThumbUrl ? (
              <div
                className="image"
                style={{ backgroundImage: `url(${videoThumbUrl})` }}
                aria-label={asset.id}
              />
            ) : (
              <VideoFileIcon
                className="placeholder"
                style={{ color: `var(--c_${assetType})`, zIndex: Z_INDEX.raised }}
                titleAccess={asset.content_type || t("fileTypes.video")}
              />
            )}
          </>
        )}
        {isPdf && (
          <>
            {!asset.thumb_url && (
              <PictureAsPdfIcon
                className="placeholder"
                style={{ color: `var(--c_${assetType})` }}
                titleAccess={asset.content_type || t("fileTypes.pdf")}
              />
            )}
            {asset.thumb_url && (
              // The server renders the first page to a JPEG; `get_url` is the
              // PDF itself, which no browser paints as a background image — it
              // only pulls the whole document down behind an empty tile.
              <div
                className="image"
                style={{
                  backgroundImage: `url(${asset.thumb_url})`
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
            titleAccess={asset.content_type || t("fileTypes.json")}
          />
        )}
        {isCsv && (
          <TableChartIcon
            className="placeholder"
            style={{ color: `var(--c_${assetType})` }}
            titleAccess={asset.content_type || t("fileTypes.csv")}
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
              titleAccess={asset.content_type || t("fileTypes.unknown")}
            />
          )}
        {showFavoriteButton && !isParent && (
          <FavoriteButton
            className={`asset-favorite${asset.favorite ? " is-favorite" : ""}`}
            isFavorite={asset.favorite === true}
            onToggle={handleToggleFavorite}
          />
        )}
        {showInfo && showName && assetItemSize > 1 && (
          <div className="asset-caption">
            <Text
              className={`name ${assetItemSize > 4 ? "large" : ""}`}
            >
              {asset.name}
            </Text>
            {metaLine && <Text className="meta">{metaLine}</Text>}
          </div>
        )}
        {asset.offline === true && (
          <StatusPill
            tone="failed"
            data-testid="asset-media-offline"
            sx={{
              position: "absolute",
              top: getSpacingPx(SPACING.xs),
              left: getSpacingPx(SPACING.xs),
              zIndex: Z_INDEX.raised
            }}
          >
            {t("fileTypes.offline")}
          </StatusPill>
        )}
      </div>
      {showInfo && (
        <>
          {showFiletype && assetFileEnding && assetItemSize > 3 && (
            <Text
              className="filetype info"
              size="smaller"
              title={asset.content_type || t("fileTypes.unknownContentType")}
              style={{
                color: `var(--c_${assetType}, var(--palette-common-white))`,
                textTransform: "uppercase",
                zIndex: Z_INDEX.raised
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
                title={t("fileSize", { size: formatFileSize(asset.size) })}
              >
                {formatFileSize(asset.size)}
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
  const assetChanged =
    prevProps.asset.id !== nextProps.asset.id ||
    prevProps.asset.offline !== nextProps.asset.offline ||
    prevProps.asset.favorite !== nextProps.asset.favorite;
  const functionsChanged =
    prevProps.onSelect !== nextProps.onSelect ||
    prevProps.onDoubleClick !== nextProps.onDoubleClick;

  const shouldUpdate = selectionChanged || assetChanged || functionsChanged;

  return !shouldUpdate; // memo returns true to skip re-render
});
