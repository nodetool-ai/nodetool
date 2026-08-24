/**
 * ShotMediaViewer
 *
 * Fullscreen viewer for one storyboard still or clip. A board holds its media
 * as `asset://` locators, so the URL and content type come from the asset
 * record; the viewer itself is the one the asset explorer opens, which is what
 * gives the shot media a download, copy, and info panel for free.
 */

import React, { memo } from "react";
import type { ImageRef, VideoRef } from "@nodetool-ai/protocol";

import AssetViewer from "../assets/AssetViewer";
import { useResolvedMedia } from "../../hooks/useResolvedMediaUri";

interface ShotMediaViewerProps {
  /** The still or clip to show, or nothing when the viewer is closed. */
  media: ImageRef | VideoRef | null | undefined;
  onClose: () => void;
}

const ShotMediaViewerInner: React.FC<ShotMediaViewerProps> = ({
  media,
  onClose
}) => {
  const { url, contentType } = useResolvedMedia(media ?? undefined);

  if (!media || !url) {
    return null;
  }

  return (
    <AssetViewer
      url={url}
      contentType={contentType ?? (media.type === "video" ? "video/*" : "image/*")}
      open
      onClose={onClose}
    />
  );
};

export const ShotMediaViewer = memo(ShotMediaViewerInner);
ShotMediaViewer.displayName = "ShotMediaViewer";

export default ShotMediaViewer;
