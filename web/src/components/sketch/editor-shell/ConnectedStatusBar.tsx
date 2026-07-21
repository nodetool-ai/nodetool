/**
 * ConnectedStatusBar — full-width status strip at the bottom of the standalone
 * image editor. Shows canvas dimensions, color space / bit depth, zoom, the
 * active foreground color, live cursor position, selection size, and layer
 * count — all from real store state. It replaces the floating info pill in the
 * standalone editor (the in-node modal keeps the pill).
 *
 * Narrow selectors only; the selection bounds are memoised on the selection
 * mask so frequent foreground-color / cursor updates don't recompute them.
 * Color space (sRGB) and bit depth (8-bit) are static — they have no backing
 * field yet — and GPU activity / memory are intentionally omitted rather than
 * shown as never-changing labels.
 */

import React, { memo, useMemo } from "react";
import { useTheme } from "@mui/material/styles";

import { ColorSwatch, FlexRow, Tooltip } from "../../ui_primitives";
import { useSketchStore } from "../state/useSketchStore";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useSketchCanvasRefStore } from "../../../stores/sketch/SketchCanvasRefStore";
import { getSelectionBounds } from "../selection";
import { colorToHex6 } from "../types";
import { SKETCH_FONT } from "../sketchStyles";

const ConnectedStatusBarInner: React.FC = () => {
  const theme = useTheme();
  const documentId = useSketchSessionStore((s) => s.documentId);
  const panelsHidden = useSketchStore((s) => s.panelsHidden);
  const docW = useSketchStore((s) => s.document.canvas.width);
  const docH = useSketchStore((s) => s.document.canvas.height);
  const zoom = useSketchStore((s) => s.zoom);
  const layerCount = useSketchStore((s) => s.document.layers.length);
  const foregroundColor = useSketchStore((s) => s.foregroundColor) || "#ffffff";
  const cursorDocPos = useSketchStore((s) => s.cursorDocPos);
  const selection = useSketchStore((s) => s.selection);
  const hasActiveSelection = useSketchStore((s) => s.hasActiveSelection);
  const fitViewToScreen = useSketchCanvasRefStore((s) => s.fitViewToScreen);

  const selBounds = useMemo(
    () =>
      hasActiveSelection && selection ? getSelectionBounds(selection) : null,
    [hasActiveSelection, selection]
  );

  if (!documentId || panelsHidden) {
    return null;
  }

  const fgHex = colorToHex6(foregroundColor);

  return (
    <FlexRow
      className="sketch-status-bar"
      data-testid="sketch-status-bar"
      align="center"
      sx={{
        flexShrink: 0,
        width: "100%",
        height: 24,
        gap: 1.5,
        px: 1,
        backgroundColor: theme.vars.palette.grey[900],
        borderTop: `1px solid ${theme.vars.palette.grey[800]}`,
        color: theme.vars.palette.text.secondary,
        fontFamily: SKETCH_FONT.familyMono,
        fontSize: SKETCH_FONT.sm,
        userSelect: "none",
        overflow: "hidden",
        whiteSpace: "nowrap"
      }}
    >
      <FlexRow align="center" gap={0.5}>
        <span>
          {docW} × {docH} · sRGB · 8-bit ·
        </span>
        <Tooltip title="Fit to screen (Ctrl+0)">
          <button
            type="button"
            className="sketch-status-bar__zoom"
            onClick={fitViewToScreen ?? undefined}
            disabled={!fitViewToScreen}
            style={{
              font: "inherit",
              color: "inherit",
              background: "none",
              border: "none",
              padding: 0,
              cursor: fitViewToScreen ? "pointer" : "default"
            }}
          >
            {Math.round(zoom * 100)}%
          </button>
        </Tooltip>
      </FlexRow>

      <FlexRow align="center" gap={0.5}>
        <ColorSwatch color={fgHex} size={12} />
        <span>{fgHex}</span>
      </FlexRow>

      {cursorDocPos && (
        <span style={{ minWidth: 96 }}>
          x {cursorDocPos.x}, y {cursorDocPos.y}
        </span>
      )}

      {selBounds && (
        <span>
          selection {selBounds.width} × {selBounds.height}
        </span>
      )}

      <span style={{ marginLeft: "auto" }}>
        {layerCount} {layerCount === 1 ? "layer" : "layers"}
      </span>
    </FlexRow>
  );
};

export const ConnectedStatusBar = memo(ConnectedStatusBarInner);
ConnectedStatusBar.displayName = "ConnectedStatusBar";

export default ConnectedStatusBar;
