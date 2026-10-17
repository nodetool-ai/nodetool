/** @jsxImportSource @emotion/react */
/**
 * CompositorPreview — the live, non-interactive composite shown in the
 * Compositor node body.
 *
 * Draws the layer stack with the same {@link useWebGPUPreview} the layout
 * editor uses, so blend mode, opacity, visibility and transform edits show up
 * in the node without running the workflow.
 */

import React, { memo, useMemo, useRef } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { blendModeGpuId } from "@nodetool-ai/gpu";

import type { BitmapMap } from "./useLayerBitmaps";
import { useWebGPUPreview, type PreviewLayer } from "./useWebGPUPreview";
import type { CompositorEditorLayer } from "./types";

export interface CompositorPreviewProps {
  canvasWidth: number;
  canvasHeight: number;
  /** Positional order = stacking order (index 0 is the top layer). */
  layers: CompositorEditorLayer[];
  /** Decoded layer images keyed by layer id (see `useLayerBitmaps`). */
  bitmaps: BitmapMap;
  /** Max rendered height in CSS px. */
  maxHeight: number;
}

const styles = (theme: Theme) =>
  css({
    "&.compositor-preview": {
      display: "block",
      maxWidth: "100%",
      objectFit: "contain",
      backgroundColor: theme.vars.palette.grey[900],
      backgroundImage: `linear-gradient(45deg, ${theme.vars.palette.grey[800]} 25%, transparent 25%), linear-gradient(-45deg, ${theme.vars.palette.grey[800]} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${theme.vars.palette.grey[800]} 75%), linear-gradient(-45deg, transparent 75%, ${theme.vars.palette.grey[800]} 75%)`,
      backgroundSize: "16px 16px",
      backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0"
    }
  });

const CompositorPreviewInner: React.FC<CompositorPreviewProps> = ({
  canvasWidth,
  canvasHeight,
  layers,
  bitmaps,
  maxHeight
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // The compositor blends bottom-up; layer 0 is the top of the stack.
  const previewLayers = useMemo<PreviewLayer[]>(
    () =>
      [...layers].reverse().map((l) => {
        const b = bitmaps[l.id];
        return {
          id: l.id,
          bitmap: b?.bitmap ?? null,
          width: b?.width ?? 1,
          height: b?.height ?? 1,
          opacity: l.opacity,
          blendModeId: blendModeGpuId(l.blendMode),
          visible: l.visible,
          transform: l.transform
        };
      }),
    [layers, bitmaps]
  );

  useWebGPUPreview(canvasRef, canvasWidth, canvasHeight, previewLayers);

  return (
    <canvas
      ref={canvasRef}
      css={cssStyles}
      className="compositor-preview"
      style={{ maxHeight }}
      role="img"
      aria-label="Composited preview"
    />
  );
};

export const CompositorPreview = memo(CompositorPreviewInner);
CompositorPreview.displayName = "CompositorPreview";

export default CompositorPreview;
