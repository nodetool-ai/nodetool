/**
 * MediaThumbnail
 *
 * One tile for any stored media: an image, a video, an audio clip or a file.
 * It picks the renderer by content type, keeps the aspect ratio, falls back to
 * a type icon, and offers a `label` slot and a hover `actions` slot.
 *
 * Media goes through the resolution boundary: an `asset` record contributes
 * its server-resolved `thumb_url`/`get_url`, and a `locator` (`asset://<id>`,
 * a `*Ref`, any URL) is resolved by `ResponsiveImage`, `VideoPlayer` and
 * `AudioPlayback`. A raw `asset://` string is never used as `src`.
 */

import React, { memo } from "react";
import { Box, type BoxProps } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import AudiotrackOutlinedIcon from "@mui/icons-material/AudiotrackOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import { useResolvedMedia, type MediaLocator } from "../../hooks/useResolvedMediaUri";
import { asResolvedMediaUrl } from "../../utils/resolveMediaUri";
import { AudioPlayback } from "./AudioPlayback";
import { ResponsiveImage } from "./ResponsiveImage";
import { VideoPlayer } from "./VideoPlayer";
import { BORDER_RADIUS, MOTION, Z_INDEX } from "./tokens";
import { SPACING, getSpacingPx } from "./spacing";

export type MediaThumbnailKind = "image" | "video" | "audio" | "other";

/** The renderer family for a MIME type. `image/*`, `video/*` and `audio/*` are matched by prefix. */
export const mediaKindFromContentType = (
  contentType: string | null | undefined
): MediaThumbnailKind => {
  if (contentType?.startsWith("image/")) {
    return "image";
  }
  if (contentType?.startsWith("video/")) {
    return "video";
  }
  if (contentType?.startsWith("audio/")) {
    return "audio";
  }
  return "other";
};

/** The fields of an `Asset` record a thumbnail reads. */
export interface MediaThumbnailAsset {
  content_type?: string | null;
  /** Server-resolved thumbnail URL. */
  thumb_url?: string | null;
  /** Server-resolved media URL. */
  get_url?: string | null;
}

export interface MediaThumbnailProps
  extends Omit<BoxProps, "children" | "onError"> {
  /** An asset record. Mutually exclusive with `locator`. */
  asset?: MediaThumbnailAsset;
  /** A stored media locator (`asset://<id>`, a `*Ref`, or a URL). Mutually exclusive with `asset`. */
  locator?: MediaLocator;
  /** Overrides the type read from `asset` or resolved from `locator`. */
  contentType?: string | null;
  /** Fixes the renderer family when the caller already knows it. Wins over `contentType`. */
  kind?: MediaThumbnailKind;
  /** Alt text, also the accessible name of a player or icon tile. */
  alt: string;
  /** CSS aspect ratio of the tile. Default `"1/1"`. */
  aspectRatio?: string;
  /** How a still fills the tile. Default `"cover"`. */
  fit?: "cover" | "contain";
  /** Corner radius. Default `BORDER_RADIUS.md`. */
  borderRadius?: number | string;
  /**
   * Play media in place: video renders a `VideoPlayer`, audio an
   * `AudioPlayback`. Default `false`: a video shows its thumbnail and audio
   * shows its icon.
   */
  interactive?: boolean;
  /** Icon for the fallback tile. Default depends on the media kind. */
  icon?: React.ReactNode;
  /** Content pinned to the bottom edge on a scrim, such as a `MediaLabel`. */
  label?: React.ReactNode;
  /** Controls revealed on hover or keyboard focus, pinned to the top right. */
  actions?: React.ReactNode;
  /** Native lazy loading for stills. Default `"lazy"`. */
  loading?: "eager" | "lazy";
}

const KIND_ICON: Record<MediaThumbnailKind, React.ReactElement> = {
  image: <ImageOutlinedIcon />,
  video: <MovieOutlinedIcon />,
  audio: <AudiotrackOutlinedIcon />,
  other: <InsertDriveFileOutlinedIcon />
};

const frameSx = {
  width: "100%",
  height: "100%"
} as const;

interface RenderProps {
  kind: MediaThumbnailKind;
  alt: string;
  fit: "cover" | "contain";
  loading: "eager" | "lazy";
  interactive: boolean;
  icon?: React.ReactNode;
}

const IconTile: React.FC<{ kind: MediaThumbnailKind; alt: string; icon?: React.ReactNode }> = ({
  kind,
  alt,
  icon
}) => (
  <Box
    role="img"
    aria-label={alt}
    sx={{
      ...frameSx,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "action.hover",
      color: "text.secondary"
    }}
  >
    {icon ?? KIND_ICON[kind]}
  </Box>
);

const AssetMedia: React.FC<RenderProps & { asset: MediaThumbnailAsset }> = ({
  asset,
  kind,
  alt,
  fit,
  loading,
  interactive,
  icon
}) => {
  const thumb = asResolvedMediaUrl(asset.thumb_url);
  const full = asResolvedMediaUrl(asset.get_url);
  if (kind === "video" && interactive && full) {
    return <VideoPlayer src={full} poster={thumb ?? ""} label={alt} />;
  }
  if (kind === "audio" && interactive && full) {
    return <AudioPlayback src={full} label={alt} />;
  }
  const still = kind === "image" ? (thumb ?? full) : kind === "video" ? thumb : null;
  if (still) {
    return (
      <ResponsiveImage src={still} alt={alt} fit={fit} loading={loading} sx={frameSx} />
    );
  }
  return <IconTile kind={kind} alt={alt} icon={icon} />;
};

const LocatorMedia: React.FC<
  Omit<RenderProps, "kind"> & {
    locator: MediaLocator;
    contentType?: string | null;
    kind?: MediaThumbnailKind;
  }
> = ({ locator, contentType, kind: fixedKind, alt, fit, loading, interactive, icon }) => {
  const resolved = useResolvedMedia(locator);
  const kind =
    fixedKind ?? mediaKindFromContentType(contentType ?? resolved.contentType);
  if (kind === "video" && interactive) {
    return <VideoPlayer locator={locator} label={alt} />;
  }
  if (kind === "audio" && interactive) {
    return <AudioPlayback locator={locator} label={alt} />;
  }
  if (kind === "image") {
    return (
      <ResponsiveImage
        locator={locator}
        preferThumbnail
        alt={alt}
        fit={fit}
        loading={loading}
        sx={frameSx}
      />
    );
  }
  if (kind === "video" && resolved.thumbUrl) {
    return (
      <ResponsiveImage
        src={resolved.thumbUrl}
        alt={alt}
        fit={fit}
        loading={loading}
        sx={frameSx}
      />
    );
  }
  return <IconTile kind={kind} alt={alt} icon={icon} />;
};

const overlaySx = (theme: Theme) => ({
  position: "absolute" as const,
  zIndex: Z_INDEX.raised,
  color: theme.vars.palette.common.white
});

export const MediaThumbnail: React.FC<MediaThumbnailProps> = memo(
  function MediaThumbnail({
    asset,
    locator,
    contentType,
    kind,
    alt,
    aspectRatio = "1/1",
    fit = "cover",
    borderRadius = BORDER_RADIUS.md,
    interactive = false,
    icon,
    label,
    actions,
    loading = "lazy",
    sx,
    ...rest
  }) {
    const shared = { alt, fit, loading, interactive, icon };
    return (
      <Box
        {...rest}
        sx={[
          {
            position: "relative",
            overflow: "hidden",
            width: "100%",
            aspectRatio,
            borderRadius,
            "& .media-thumbnail-actions": {
              opacity: 0,
              transition: MOTION.opacity
            },
            "&:hover .media-thumbnail-actions, &:focus-within .media-thumbnail-actions":
              { opacity: 1 }
          },
          ...(Array.isArray(sx) ? sx : [sx])
        ]}
      >
        {asset ? (
          <AssetMedia
            {...shared}
            asset={asset}
            kind={kind ?? mediaKindFromContentType(contentType ?? asset.content_type)}
          />
        ) : (
          <LocatorMedia
            {...shared}
            locator={locator}
            contentType={contentType}
            kind={kind}
          />
        )}
        {label ? (
          <Box
            className="media-thumbnail-label"
            sx={(theme) => ({
              ...overlaySx(theme),
              left: 0,
              right: 0,
              bottom: 0,
              padding: getSpacingPx(SPACING.xs),
              background: `linear-gradient(to top, rgb(${theme.vars.palette.common.blackChannel} / 0.65), transparent)`,
              pointerEvents: "none"
            })}
          >
            {label}
          </Box>
        ) : null}
        {actions ? (
          <Box
            className="media-thumbnail-actions"
            sx={(theme) => ({
              ...overlaySx(theme),
              top: getSpacingPx(SPACING.xs),
              right: getSpacingPx(SPACING.xs),
              display: "flex",
              gap: getSpacingPx(SPACING.xs)
            })}
          >
            {actions}
          </Box>
        ) : null}
      </Box>
    );
  }
);

MediaThumbnail.displayName = "MediaThumbnail";
