import React, { memo } from "react";
import { useTranslation } from "react-i18next";

import { Asset } from "../../stores/ApiTypes";
import { FlexColumn, SPACING, VideoPlayer } from "../ui_primitives";

interface VideoViewerProps {
  asset?: Asset;
  url?: string;
}

/**
 * Full-size player for a video asset or a workspace video file. The document
 * bar above it carries the name.
 */
const VideoViewer: React.FC<VideoViewerProps> = memo(function VideoViewer({ asset, url }) {
  const { t } = useTranslation();
  return (
    <FlexColumn
      className="video-viewer"
      align="center"
      justify="center"
      fullWidth
      sx={{
        height: "80%",
        mt: SPACING.xxxl,
        "& .video-viewer-player": { width: "60%", maxHeight: "90%" }
      }}
    >
      <VideoPlayer
        className="video-viewer-player"
        locator={asset?.get_url || url || ""}
        label={asset?.name || t("screen_assets.viewer.video")}
      />
    </FlexColumn>
  );
});

export default VideoViewer;
