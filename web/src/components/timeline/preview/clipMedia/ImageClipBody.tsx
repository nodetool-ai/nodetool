/** @jsxImportSource @emotion/react */
/**
 * ImageClipBody
 *
 * Rendered inside the Clip chrome for image clips.
 * Shows the clip's thumbnail (or full image) if a URL is available;
 * falls back to a PlaceholderClipBody when no asset exists.
 */

import React, { memo } from "react";
import { css } from "@emotion/react";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { PlaceholderClipBody } from "./PlaceholderClipBody";

// ── Styles ─────────────────────────────────────────────────────────────────

const imgStyles = css({
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center",
  pointerEvents: "none",
  display: "block"
});

// ── Props ──────────────────────────────────────────────────────────────────

export interface ImageClipBodyProps {
  clip: TimelineClip;
  /** Resolved HTTP URL for the image asset. */
  assetUrl?: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export const ImageClipBody: React.FC<ImageClipBodyProps> = memo(
  ({ clip, assetUrl }) => {
    if (!assetUrl) {
      return <PlaceholderClipBody label={clip.status} />;
    }

    return (
      <img
        css={imgStyles}
        src={assetUrl}
        alt={clip.name}
        draggable={false}
        aria-hidden
      />
    );
  }
);

ImageClipBody.displayName = "ImageClipBody";
