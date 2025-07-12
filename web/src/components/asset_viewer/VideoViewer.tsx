/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import { Asset } from "../../stores/ApiTypes";
import { Typography } from "@mui/material";

interface VideoViewerProps {
  asset?: Asset;
  url?: string;
}

const styles = (theme: Theme) =>
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

const VideoViewer: React.FC<VideoViewerProps> = ({ asset, url }) => {
  return (
    <div className="video-viewer" css={styles}>
      <video controls={true} src={asset?.get_url || ""}>
        Your browser does not support the video element.
      </video>
      <Typography variant="h3" color="textSecondary">
        {asset?.name}
      </Typography>
    </div>
  );
};

export default VideoViewer;
