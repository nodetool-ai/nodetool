/** @jsxImportSource @emotion/react */

import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { FlexRow, Text } from "../../../ui_primitives";

const rootStyles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    position: "relative",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    paddingLeft: 4,
    paddingRight: 4,
    color: theme.vars.palette.primary.contrastText
  });

const waveformStyles = (theme: Theme) =>
  css({
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    gap: 1,
    paddingLeft: 4,
    paddingRight: 4,
    opacity: 0.35,
    pointerEvents: "none"
  });

const barStyles = (theme: Theme, height: number) =>
  css({
    flex: "0 0 2px",
    borderRadius: 1,
    height: `${height}%`,
    backgroundColor: theme.vars.palette.primary.light
  });


const BARS = 40;

/**
 * Generates a deterministic fake waveform from the clip id.
 * Real WaveSurfer peaks can be substituted here in a future iteration.
 */
function deterministicBars(seed: string): number[] {
  const bars: number[] = [];
  for (let i = 0; i < BARS; i++) {
    const charCode = seed.charCodeAt(i % seed.length) || 65;
    const secondary = seed.charCodeAt((i * 7) % seed.length) || 97;
    bars.push(20 + ((charCode * 37 + secondary * 13 + i * 17) % 70));
  }
  return bars;
}


export interface AudioClipBodyProps {
  clip: TimelineClip;
}

export const AudioClipBody: React.FC<AudioClipBodyProps> = memo(({ clip }) => {
  const theme = useTheme();
  const bars = deterministicBars(clip.id);
  const isMuted = clip.muted === true;

  return (
    <div css={rootStyles(theme)}>
      {/* Waveform bars (visual only) */}
      <div css={waveformStyles(theme)}>
        {bars.map((h, i) => (
          <div key={i} css={barStyles(theme, h)} />
        ))}
      </div>

      {/* Clip label */}
      <FlexRow gap={0.5} align="center" sx={{ position: "relative", zIndex: 1 }}>
        {isMuted && (
          <Text
            sx={{
              fontSize: 10,
              opacity: 0.7,
              color: theme.vars.palette.warning.light
            }}
          >
            🔇
          </Text>
        )}
        <Text
          sx={{
            fontSize: 10,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            opacity: isMuted ? 0.5 : 0.9
          }}
        >
          {clip.name}
        </Text>
      </FlexRow>
    </div>
  );
});

AudioClipBody.displayName = "AudioClipBody";
