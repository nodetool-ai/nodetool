import React, { MouseEventHandler, memo } from "react";

import { Asset } from "../../stores/ApiTypes";
import AudioPlayer from "../audio/AudioPlayer";
import { BORDER_RADIUS, FlexColumn, SPACING } from "../ui_primitives";

interface AudioViewerProps {
  asset?: Asset;
  url?: string;
}

const WAVEFORM_HEIGHT = 160;
const MINIMAP_HEIGHT = 40;

const handleRightClick: MouseEventHandler<HTMLDivElement> = (event) => {
  event.preventDefault();
  event.stopPropagation();
};

/** Full-size waveform player for an audio asset or a workspace audio file. */
const AudioViewer: React.FC<AudioViewerProps> = memo(function AudioViewer({
  asset,
  url
}) {
  return (
    <FlexColumn
      className="audio-viewer"
      align="center"
      justify="center"
      fullWidth
      fullHeight
      onContextMenu={handleRightClick}
      sx={{ p: SPACING.xl, overflow: "auto" }}
    >
      <FlexColumn
        gap={SPACING.lg}
        sx={{
          width: "100%",
          maxWidth: 960,
          p: SPACING.xl,
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
          borderRadius: BORDER_RADIUS.lg
        }}
      >
        <AudioPlayer
          alwaysShowControls={true}
          source={asset?.get_url || url || ""}
          filename={asset?.name}
          showFilename={false}
          fontSize="normal"
          height={WAVEFORM_HEIGHT}
          barHeight={0.8}
          barWidth={2}
          barGap={1}
          barRadius={2}
          minimapHeight={MINIMAP_HEIGHT}
          minimapBarHeight={2.0}
          waveformHeight={WAVEFORM_HEIGHT}
        />
      </FlexColumn>
    </FlexColumn>
  );
});

export default AudioViewer;
