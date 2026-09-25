/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { MouseEventHandler, memo } from "react";
import { Asset } from "../../stores/ApiTypes";
import AudioPlayer from "../audio/AudioPlayer";

import { Text, getSpacingPx, SPACING } from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

interface AudioViewerProps {
  asset?: Asset;
  url?: string;
}

const styles = (theme: Theme) =>
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
      backgroundColor: theme.vars.palette.grey[800],
      margin: `${getSpacingPx(SPACING.xxxl)} 0`,
      padding: getSpacingPx(SPACING.xl)
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
      marginTop: getSpacingPx(SPACING.xl)
    },
    ".audio-controls p.tiny": {
      fontSize: `${theme.fontSizeNormal} !important`
    },
    ".audio-controls button": {
      width: "3em !important",
      height: "3em !important",
      marginRight: getSpacingPx(SPACING.xl),
      padding: getSpacingPx(SPACING.xxl)
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

const AudioViewer: React.FC<AudioViewerProps> = memo(function AudioViewer({ asset, url }) {
  const theme = useTheme();
  return (
    <div
      className="audio-viewer"
      css={styles(theme)}
      onContextMenu={handleRightClick}
    >
      <Text size="small">{asset?.content_type}</Text>
      <AudioPlayer
        alwaysShowControls={true}
        source={asset?.get_url || url || ""}
        filename={asset?.name}
        fontSize="normal"
        height={50}
        barHeight={0.8}
        minimapHeight={50}
        minimapBarHeight={2.0}
        waveColor="#ddd"
        progressColor="#666"
        waveformHeight={50}
      />
    </div>
  );
});

export default AudioViewer;
