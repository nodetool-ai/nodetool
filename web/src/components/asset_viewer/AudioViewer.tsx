import React, { MouseEventHandler, memo } from "react";
import AudiotrackOutlinedIcon from "@mui/icons-material/AudiotrackOutlined";

import { Asset } from "../../stores/ApiTypes";
import AudioPlayer from "../audio/AudioPlayer";
import {
  BORDER_RADIUS,
  Box,
  Caption,
  FlexColumn,
  FlexRow,
  SPACING,
  TruncatedText,
  TYPOGRAPHY
} from "../ui_primitives";

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
  const title = asset?.name || url?.split("/").pop() || "Audio";
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
        <FlexRow align="center" gap={SPACING.md} sx={{ minWidth: 0 }}>
          <FlexRow
            align="center"
            justify="center"
            sx={{
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: BORDER_RADIUS.md,
              bgcolor: "action.hover",
              color: "text.secondary"
            }}
          >
            <AudiotrackOutlinedIcon fontSize="small" />
          </FlexRow>
          <Box sx={{ minWidth: 0 }}>
            <TruncatedText
              showTooltip
              color="text.primary"
              sx={TYPOGRAPHY.sans.label}
            >
              {title}
            </TruncatedText>
            {asset?.content_type && (
              <Caption color="secondary">{asset.content_type}</Caption>
            )}
          </Box>
        </FlexRow>
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
