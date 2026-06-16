/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";
import AudiotrackIcon from "@mui/icons-material/Audiotrack";
import MovieIcon from "@mui/icons-material/Movie";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";

import { useAssetById } from "../../../../serverState/useAssetById";
import { assetMediaKind, parseAssetUri } from "./promptTokens";

const chipStyles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25em",
    verticalAlign: "baseline",
    margin: `0 ${theme.spacing(0.5)}`,
    padding: "0 0.4em",
    borderRadius: "var(--rounded-sm, 4px)",
    backgroundColor: theme.vars.palette.primary.main,
    color: theme.vars.palette.primary.contrastText,
    fontFamily: theme.fontFamily2,
    fontSize: theme.fontSizeSmaller,
    lineHeight: 1.6,
    whiteSpace: "nowrap",
    userSelect: "none",
    "& svg": { fontSize: "1em" }
  });

const previewStyles = (theme: Theme) =>
  css({
    display: "inline-flex",
    verticalAlign: "middle",
    margin: `0 ${theme.spacing(0.5)}`,
    borderRadius: "var(--rounded-sm, 4px)",
    overflow: "hidden",
    border: `1px solid ${theme.vars.palette.primary.main}`,
    userSelect: "none",
    "& img": {
      display: "block",
      height: "2.6em",
      maxWidth: 160,
      objectFit: "cover"
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
  const previewUrl =
    thumb || resolved?.thumb_url || resolved?.get_url || undefined;
  const displayLabel = resolved?.name || label;

  if (wantsPreview && previewUrl) {
    return (
      <span
        css={previewStyles(theme)}
        className="asset-mention-chip asset-mention-preview nodrag"
        contentEditable={false}
        title={displayLabel}
      >
        <img src={previewUrl} alt={displayLabel} />
      </span>
    );
  }

  const Icon =
    kind === "image"
      ? ImageIcon
      : kind === "audio"
        ? AudiotrackIcon
        : kind === "video"
          ? MovieIcon
          : InsertDriveFileIcon;
  return (
    <span
      css={chipStyles(theme)}
      className="asset-mention-chip nodrag"
      contentEditable={false}
      title={uri}
    >
      <Icon />
      {displayLabel}
    </span>
  );
};
