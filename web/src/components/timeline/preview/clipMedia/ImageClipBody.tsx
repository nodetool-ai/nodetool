/** @jsxImportSource @emotion/react */

import React, { memo } from "react";
import { css } from "@emotion/react";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { PlaceholderClipBody } from "./PlaceholderClipBody";

const imgStyles = css({
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center",
  pointerEvents: "none",
  display: "block"
});


export interface ImageClipBodyProps {
  clip: TimelineClip;
  /** Resolved HTTP URL for the image asset. */
  assetUrl?: string;
}

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
