/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { memo } from "react";
import { Asset } from "../../stores/ApiTypes";
import { Box } from "@mui/material";
import { Text } from "../ui_primitives";
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
    video: {
      margin: 0,
      width: "60%",
      height: "auto",
      maxHeight: "90%",
      top: 0,
      display: "block"
    }
  });

const VideoViewer: React.FC<VideoViewerProps> = memo(function VideoViewer({ asset }) {
  return (
    <Box className="video-viewer" css={styles()}>
      <video controls={true} src={asset?.get_url || ""}>
        Your browser does not support the video element.
      </video>
      <Text size="big" color="secondary">
        {asset?.name}
      </Text>
    </Box>
  );
});

export default VideoViewer;
