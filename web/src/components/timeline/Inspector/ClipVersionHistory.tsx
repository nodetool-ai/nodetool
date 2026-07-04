/** @jsxImportSource @emotion/react */
/**
 * ClipVersionHistory
 *
 * Generation history for a generated clip: a strip of thumbnails, one per
 * successful generation (newest first), with the active one ringed. Clicking a
 * tile swaps the clip back to that generation via `restoreVersion` (which
 * restores its asset and the param snapshot it was made with). Both generation
 * paths append a `ClipVersion` on success, so this works for direct-gen and
 * workflow-bound clips alike.
 */

import React, { memo, useCallback, useEffect, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import CheckIcon from "@mui/icons-material/Check";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";

import type { ClipVersion, TimelineClip } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { useAssetStore } from "../../../stores/AssetStore";
import { getAssetUrl } from "../../../utils/assetHelpers";
import { relativeTime } from "../../../utils/formatDateAndTime";
import {
  Caption,
  CollapsibleSection,
  Tooltip,
  BORDER_RADIUS,
  MOTION,
  SPACING,
  getSpacingPx
} from "../../ui_primitives";
import { InspectorSectionTitle } from "./InspectorPrimitives";

const TILE_PX = 56;

const stripStyles = (theme: Theme) =>
  css({
    display: "flex",
    gap: getSpacingPx(SPACING.sm),
    padding: theme.spacing(1),
    overflowX: "auto",
    overflowY: "hidden",
    // Keep the scrollbar quiet on the dark panel.
    scrollbarWidth: "thin"
  });

const tileStyles = (theme: Theme, active: boolean, interactive: boolean) =>
  css({
    position: "relative",
    flex: "0 0 auto",
    width: TILE_PX,
    height: TILE_PX,
    padding: 0,
    borderRadius: BORDER_RADIUS.sm,
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.default,
    backgroundSize: "cover",
    backgroundPosition: "center",
    border: `1px solid ${
      active ? theme.vars.palette.primary.main : theme.vars.palette.divider
    }`,
    boxShadow: active
      ? `0 0 0 1px ${theme.vars.palette.primary.main}`
      : "none",
    cursor: interactive ? "pointer" : "default",
    transition: `${MOTION.border}, ${MOTION.shadow}`,
    outline: "none",
    "&:hover": interactive
      ? { borderColor: theme.vars.palette.primary.main }
      : undefined,
    "&:focus-visible": {
      borderColor: theme.vars.palette.primary.main,
      boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}`
    }
  });

const tileMediaStyles = css({
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block"
});

const iconTileStyles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: theme.vars.palette.text.disabled
  });

const activeBadgeStyles = (theme: Theme) =>
  css({
    position: "absolute",
    top: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: BORDER_RADIUS.circle,
    backgroundColor: theme.vars.palette.primary.main,
    color: theme.vars.palette.primary.contrastText,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  });

interface VersionTileProps {
  version: ClipVersion;
  active: boolean;
  index: number;
  total: number;
  mediaType: TimelineClip["mediaType"];
  interactive: boolean;
  onSelect: (versionId: string) => void;
}

const VersionTile: React.FC<VersionTileProps> = memo(
  ({ version, active, index, total, mediaType, interactive, onSelect }) => {
    const theme = useTheme();
    const getAsset = useAssetStore((s) => s.get);
    const [url, setUrl] = useState<string | undefined>(undefined);

    useEffect(() => {
      let cancelled = false;
      getAsset(version.assetId)
        .then((asset) => {
          if (!cancelled) setUrl(getAssetUrl(asset) ?? undefined);
        })
        .catch(() => {
          // Asset unavailable — tile falls back to the media-type icon.
        });
      return () => {
        cancelled = true;
      };
    }, [version.assetId, getAsset]);

    // Newest first → label by recency ("Latest", then "2 ago", "3 ago"…).
    const ordinal = index === 0 ? "Latest" : `#${total - index}`;
    const when = relativeTime(version.createdAt);
    const tooltip = active ? `Current · ${when}` : `${ordinal} · ${when}`;

    const isImage = mediaType === "image" || mediaType === "overlay";
    const isVideo = mediaType === "video";
    const isAudio = mediaType === "audio";

    const handleClick = useCallback(() => {
      if (interactive && !active) onSelect(version.id);
    }, [interactive, active, onSelect, version.id]);

    return (
      <Tooltip title={tooltip}>
        <button
          type="button"
          css={tileStyles(theme, active, interactive)}
          style={isImage && url ? { backgroundImage: `url(${url})` } : undefined}
          onClick={handleClick}
          aria-label={`${tooltip} — swap to this generation`}
          aria-current={active}
          disabled={!interactive}
        >
          {isVideo && url && (
            <video
              css={tileMediaStyles}
              src={`${url}#t=0.1`}
              muted
              playsInline
              preload="metadata"
            />
          )}
          {isAudio && (
            <span css={iconTileStyles(theme)}>
              <GraphicEqIcon fontSize="small" />
            </span>
          )}
          {active && (
            <span css={activeBadgeStyles(theme)} aria-hidden>
              <CheckIcon sx={{ fontSize: 10 }} />
            </span>
          )}
        </button>
      </Tooltip>
    );
  }
);
VersionTile.displayName = "VersionTile";

export interface ClipVersionHistoryProps {
  clipId: string;
}

export const ClipVersionHistory: React.FC<ClipVersionHistoryProps> = memo(
  ({ clipId }) => {
    const theme = useTheme();
    const clip = useTimelineStore((s) => findClipById(s.clips, clipId));
    const restoreVersion = useTimelineStore((s) => s.restoreVersion);

    const handleSelect = useCallback(
      (versionId: string) => restoreVersion(clipId, versionId),
      [restoreVersion, clipId]
    );

    if (!clip) return null;

    // Only successful generations carry a usable asset to swap to. Newest first.
    const successVersions = (clip.versions ?? [])
      .filter((v) => v.status === "success")
      .slice()
      .reverse();

    if (successVersions.length === 0) return null;

    const interactive = !clip.locked;

    return (
      <CollapsibleSection
        title={
          <InspectorSectionTitle
            title={`History (${successVersions.length})`}
            icon={<HistoryOutlinedIcon />}
          />
        }
        defaultOpen
      >
        {clip.locked && (
          <Caption color="secondary" sx={{ px: 1, pt: 0.5 }}>
            Unlock the clip to swap generations.
          </Caption>
        )}
        <div css={stripStyles(theme)}>
          {successVersions.map((version, index) => (
            <VersionTile
              key={version.id}
              version={version}
              active={version.assetId === clip.currentAssetId}
              index={index}
              total={successVersions.length}
              mediaType={clip.mediaType}
              interactive={interactive}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </CollapsibleSection>
    );
  }
);

ClipVersionHistory.displayName = "ClipVersionHistory";
