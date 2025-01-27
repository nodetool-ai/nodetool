/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { MouseEventHandler } from "react";
import { Asset } from "../../stores/ApiTypes";
import AudioPlayer from "../audio/AudioPlayer";

import { Typography } from "@mui/material";

interface AudioViewerProps {
  asset?: Asset;
  url?: string;
}

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      width: "80vw",
      margin: "20vh auto 0 auto"
    },
    ".audio-controls-container": {
      width: "100%"
    },
    ".audio-controls": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      backgroundColor: theme.palette.c_gray1,
      margin: "2em 0",
      padding: "1em"
    },
    ".controls": {
      display: "flex",
      flexDirection: "column"
    },
    ".controls .zoom": {
      maxWidth: "200px"
    },

    ".audio-viewer #waveform": {
      height: "50px !important"
    },
    ".audio-viewer .audio-controls .minimap": {
      height: "30px !important",
      backgroundColor: "transparent !important",
      opacity: "1 !important",
      marginTop: "1em"
    },
    ".audio-controls p.tiny": {
      fontSize: `${theme.fontSizeNormal} !important`
    },
    ".audio-controls button": {
      width: "3em !important",
      height: "3em !important",
      marginRight: "1em",
      padding: "1.5em"
    },
    ".audio-controls button svg": {
      width: "1.5em !important",
      height: "1.5em !important"
    },
    ".audio-controls .zoom": {
      maxWidth: "250px"
    },
    ".audio-controls .zoom p span.tiny": {
      fontSize: `${theme.fontSizeNormal} !important`
    }
  });

const handleRightClick: MouseEventHandler<HTMLImageElement> = (event) => {
  event.preventDefault();
  event.stopPropagation();
};

/**
 * AudioViewer component, used to display an audio player for a given asset.
 */
const AudioViewer: React.FC<AudioViewerProps> = ({ asset, url }) => {
  return (
    <div className="audio-viewer" css={styles} onContextMenu={handleRightClick}>
      <Typography variant="body2">{asset?.content_type}</Typography>
      <AudioPlayer
        alwaysShowControls={true}
        source={asset?.get_url || url || ""}
        filename={asset?.name}
        fontSize="normal"
        height={50}
        barHeight={1.0}
        minimapHeight={50}
        minimapBarHeight={2.0}
        waveColor="#ddd"
        progressColor="#666"
        waveformHeight={50}
      />
    </div>
  );
};

export default AudioViewer;
