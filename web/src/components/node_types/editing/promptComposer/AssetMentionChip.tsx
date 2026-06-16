/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import MovieIcon from "@mui/icons-material/Movie";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";

import { BORDER_RADIUS, Tooltip } from "../../../ui_primitives";
import { useAssetById } from "../../../../serverState/useAssetById";
import { assetMediaKind, parseAssetUri } from "./promptTokens";

// One pill for every asset mention: a leading thumbnail (image / video) or a
// type icon (audio / file), then the asset name. The name is always visible so
// near-identical generations are distinguishable inline, not just on hover.
const chipStyles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3em",
    verticalAlign: "baseline",
    margin: `0 ${theme.spacing(0.5)}`,
    padding: "0.05em 0.45em",
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: theme.vars.palette.primary.main,
    color: theme.vars.palette.primary.contrastText,
    fontFamily: theme.fontFamily2,
    fontSize: theme.fontSizeSmaller,
    lineHeight: 1.6,
    maxWidth: 240,
    whiteSpace: "nowrap",
    userSelect: "none",
    "& .chip-icon": { fontSize: "1em", flex: "0 0 auto" },
    "& .chip-thumb": {
      flex: "0 0 auto",
      display: "block",
      height: "1.5em",
      maxWidth: "2.6em",
      objectFit: "cover",
      borderRadius: BORDER_RADIUS.xs
    },
    "& .chip-label": {
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  });

// Hover preview: the inline thumbnail is too small to read, so show the full
// frame in a card on hover.
const previewCardStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(0.75),
    padding: theme.spacing(0.75),
    background: theme.vars.palette.background.paper,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.lg,
    boxShadow: theme.shadows[6],
    "& img": {
      display: "block",
      maxWidth: 260,
      maxHeight: 260,
      width: "auto",
      height: "auto",
      objectFit: "contain",
      borderRadius: BORDER_RADIUS.sm,
      background: theme.vars.palette.grey[900]
    },
    "& .preview-name": {
      maxWidth: 260,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary
    }
  });

export const AssetMentionChip: React.FC<{
  uri: string;
  label: string;
  thumb?: string;
}> = ({ uri, label, thumb }) => {
  const theme = useTheme();
  const { assetId, ext } = parseAssetUri(uri);
  const kind = assetMediaKind(ext);
  const wantsPreview = kind === "image" || kind === "video";
  // Resolve from the store to (a) recover a preview URL when none was handed in
  // (e.g. after reloading a saved prompt) and (b) keep the label in sync when
  // the asset is renamed from the mention picker or asset library.
  const { data: resolved } = useAssetById(assetId || undefined);
  const inlineThumbUrl =
    thumb || resolved?.thumb_url || resolved?.get_url || undefined;
  const displayLabel = resolved?.name || label;
  // Inline thumbnail: only image / video carry a meaningful tiny frame.
  const hasInlineThumb = wantsPreview && !!inlineThumbUrl;
  // Hover preview: any asset with an image-safe thumbnail — images, video
  // frames, audio waveforms, PDF first pages. thumb_url is always a JPEG; only
  // fall back to get_url for actual images (a video/file get_url isn't one).
  const hoverPreviewUrl =
    thumb ||
    resolved?.thumb_url ||
    (kind === "image" ? resolved?.get_url : undefined) ||
    undefined;
  const showHoverPreview = !!hoverPreviewUrl;

  const Icon =
    kind === "image"
      ? ImageIcon
      : kind === "audio"
        ? AudiotrackIcon
        : kind === "video"
          ? MovieIcon
          : InsertDriveFileIcon;

  const chip = (
    <span
      css={chipStyles(theme)}
      className={`asset-mention-chip nodrag${
        hasInlineThumb ? " asset-mention-preview" : ""
      }`}
      contentEditable={false}
      title={showHoverPreview ? undefined : displayLabel}
    >
      {hasInlineThumb ? (
        <img className="chip-thumb" src={inlineThumbUrl} alt="" />
      ) : (
        <Icon className="chip-icon" />
      )}
      <span className="chip-label">{displayLabel}</span>
    </span>
  );

  if (!showHoverPreview) {
    return chip;
  }

  return (
    <Tooltip
      placement="top"
      delay={250}
      title={
        <div css={previewCardStyles(theme)}>
          <img src={hoverPreviewUrl} alt={displayLabel} />
          <span className="preview-name">{displayLabel}</span>
        </div>
      }
      slotProps={{
        tooltip: {
          sx: {
            p: 0,
            m: 0,
            maxWidth: "none",
            backgroundColor: "transparent"
          }
        }
      }}
    >
      {chip}
    </Tooltip>
  );
};
