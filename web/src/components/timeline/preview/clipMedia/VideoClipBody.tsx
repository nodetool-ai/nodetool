/** @jsxImportSource @emotion/react */
/**
 * VideoClipBody
 *
 * Rendered inside the Clip chrome for video and overlay clips.
 * Shows the clip's thumbnail if a URL is available; otherwise shows a
 * PlaceholderClipBody. The actual preview video playback happens inside
 * PreviewCompositor via a pooled <video> element — this component is just
 * the thumbnail representation in the tracks timeline.
 */

import React, { memo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { PlaceholderClipBody } from "./PlaceholderClipBody";
import { Text } from "../../../ui_primitives";

// ── Styles ─────────────────────────────────────────────────────────────────

const wrapperStyles = css({
  width: "100%",
  height: "100%",
  position: "relative",
  overflow: "hidden"
});

const thumbStyles = css({
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center",
  pointerEvents: "none",
  display: "block"
});

const speedBadgeStyles = (theme: Theme) =>
  css({
    position: "absolute",
    top: 2,
    left: 4,
    fontSize: 9,
    lineHeight: 1,
    color: theme.vars.palette.primary.contrastText,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: "1px 3px",
    borderRadius: 2,
    pointerEvents: "none"
  });

// ── Props ──────────────────────────────────────────────────────────────────

export interface VideoClipBodyProps {
  clip: TimelineClip;
  /** Resolved HTTP URL for the thumbnail asset. */
  thumbnailUrl?: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export const VideoClipBody: React.FC<VideoClipBodyProps> = memo(
  ({ clip, thumbnailUrl }) => {
    const theme = useTheme();

    if (!thumbnailUrl) {
      return <PlaceholderClipBody label={clip.status} />;
    }

    const speed = clip.speedMultiplier;
    const showSpeed = speed !== undefined && speed !== 1;

    return (
      <div css={wrapperStyles}>
        <img
          css={thumbStyles}
          src={thumbnailUrl}
          alt={clip.name}
          draggable={false}
          aria-hidden
        />
        {showSpeed && (
          <Text css={speedBadgeStyles(theme)}>
            {speed}×
          </Text>
        )}
      </div>
    );
  }
);

VideoClipBody.displayName = "VideoClipBody";
