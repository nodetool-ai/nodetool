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
    margin: "0 1px",
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
    margin: "0 2px",
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
  // Resolve the preview from the store only when we weren't handed one (e.g.
  // after reloading a saved prompt, where the chip starts from the URN alone).
  const { data: resolved } = useAssetById(
    wantsPreview && !thumb ? assetId : undefined
  );
  const previewUrl =
    thumb || resolved?.thumb_url || resolved?.get_url || undefined;

  if (wantsPreview && previewUrl) {
    return (
      <span
        css={previewStyles(theme)}
        className="asset-mention-chip asset-mention-preview nodrag"
        contentEditable={false}
        title={label}
      >
        <img src={previewUrl} alt={label} />
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
      {label}
    </span>
  );
};
