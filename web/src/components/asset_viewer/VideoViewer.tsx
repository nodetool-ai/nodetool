/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { memo } from "react";
import { Asset } from "../../stores/ApiTypes";
import { Text, Box, VideoPlayer } from "../ui_primitives";
import { useTranslation } from "react-i18next";
interface VideoViewerProps {
  asset?: Asset;
  url?: string;
}

const styles = () =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      width: "100%",
      height: "80%",
      marginTop: "4em"
    },
    ".video-viewer-player": {
      width: "60%",
      maxHeight: "90%"
    }
  });

const VideoViewer: React.FC<VideoViewerProps> = memo(function VideoViewer({ asset, url }) {
  const { t } = useTranslation();
  return (
    <Box className="video-viewer" css={styles()}>
      <VideoPlayer
        className="video-viewer-player"
        locator={asset?.get_url || url || ""}
        label={asset?.name || t("screen_assets.viewer.video")}
      />
      <Text size="big" color="secondary">
        {asset?.name}
      </Text>
    </Box>
  );
});

export default VideoViewer;
