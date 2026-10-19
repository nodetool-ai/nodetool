/**
 * ConnectedStatusBar — full-width status strip at the bottom of the standalone
 * image editor. Shows canvas dimensions, color space / bit depth, zoom (with
 * step buttons and a fit-to-screen readout), the
 * active foreground color, live cursor position, selection size, what
 * regenerating the document's generated layers costs, and layer count — all
 * from real store state. It replaces the floating info pill in the
 * standalone editor (the in-node modal keeps the pill).
 *
 * Narrow selectors only; the selection bounds are memoised on the selection
 * mask so frequent foreground-color / cursor updates don't recompute them.
 * Color space (sRGB) and bit depth (8-bit) are static — they have no backing
 * field yet — and GPU activity / memory are intentionally omitted rather than
 * shown as never-changing labels.
 */

import React, { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/AddOutlined";
import RemoveIcon from "@mui/icons-material/Remove";

import {
  ColorSwatch,
  FlexRow,
  SPACING,
  StatusBar,
  ToolbarIconButton,
  Tooltip
} from "../../ui_primitives";
import CostEstimateLine from "../../costs/CostEstimateLine";
import { useSketchCostEstimate } from "../../../hooks/sketch/useSketchCostEstimate";
import { useSketchStore } from "../state/useSketchStore";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useSketchCanvasRefStore } from "../../../stores/sketch/SketchCanvasRefStore";
import { getSelectionBounds } from "../selection";
import { displayCombo } from "../shortcuts";
import { colorToHex6 } from "../types";

/** Same step as the keyboard shortcuts and the wheel. */
const ZOOM_STEP = 1.3;

const zoomButtonSx = {
  width: 18,
  height: 18,
  padding: 0,
  color: "inherit",
  "& svg": { fontSize: 14 }
} as const;

/**
 * The cursor position changes on every pointer move, so it subscribes on its
 * own: the rest of the bar (and its cost estimate) re-renders only when what
 * it shows changes.
 */
const StatusCursorReadout = memo(function StatusCursorReadout() {
  const { t } = useTranslation();
  const cursorDocPos = useSketchStore((s) => s.cursorDocPos);
  if (!cursorDocPos) {
    return null;
  }
  return (
    <span style={{ minWidth: 96 }}>
      {t("i18n-next52.sketch.status.cursor", { x: cursorDocPos.x, y: cursorDocPos.y })}
    </span>
  );
});

const ConnectedStatusBarInner: React.FC = () => {
  const { t } = useTranslation();
  const documentId = useSketchSessionStore((s) => s.documentId);
  const panelsHidden = useSketchStore((s) => s.panelsHidden);
  const docW = useSketchStore((s) => s.document.canvas.width);
  const docH = useSketchStore((s) => s.document.canvas.height);
  const zoom = useSketchStore((s) => s.zoom);
  const layerCount = useSketchStore((s) => s.document.layers.length);
  const foregroundColor = useSketchStore((s) => s.foregroundColor) || "#ffffff";
  const selection = useSketchStore((s) => s.selection);
  const hasActiveSelection = useSketchStore((s) => s.hasActiveSelection);
  const fitViewToScreen = useSketchCanvasRefStore((s) => s.fitViewToScreen);
  const setZoom = useSketchStore((s) => s.setZoom);
  const costEstimate = useSketchCostEstimate();
  const fitLabel = t("i18n-next52.sketch.status.fit", { shortcut: displayCombo("zoom-fit") });
  const zoomInLabel = t("i18n-next52.sketch.status.zoomIn", { shortcut: displayCombo("zoom-in") });
  const zoomOutLabel = t("i18n-next52.sketch.status.zoomOut", { shortcut: displayCombo("zoom-out") });

  const zoomIn = useCallback(() => setZoom(zoom * ZOOM_STEP), [setZoom, zoom]);
  const zoomOut = useCallback(() => setZoom(zoom / ZOOM_STEP), [setZoom, zoom]);

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
    <StatusBar
      className="sketch-status-bar"
      data-testid="sketch-status-bar"
      sx={{ width: "100%", gap: SPACING.sm, userSelect: "none" }}
    >
      <FlexRow align="center" gap={0.5}>
        <span>
          {docW} × {docH} · sRGB · 8-bit ·
        </span>
        <ToolbarIconButton
          aria-label={zoomOutLabel}
          tooltip={zoomOutLabel}
          onClick={zoomOut}
          sx={zoomButtonSx}
          data-testid="sketch-status-zoom-out"
        >
          <RemoveIcon />
        </ToolbarIconButton>
        <Tooltip title={fitLabel} disabled={!fitViewToScreen}>
          <button
            type="button"
            className="sketch-status-bar__zoom"
            aria-label={fitLabel}
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
        <ToolbarIconButton
          aria-label={zoomInLabel}
          tooltip={zoomInLabel}
          onClick={zoomIn}
          sx={zoomButtonSx}
          data-testid="sketch-status-zoom-in"
        >
          <AddIcon />
        </ToolbarIconButton>
      </FlexRow>

      <FlexRow align="center" gap={0.5}>
        <ColorSwatch color={fgHex} size={12} />
        <span>{fgHex}</span>
      </FlexRow>

      <StatusCursorReadout />

      {selBounds && (
        <span>
          {t("i18n-next52.sketch.status.selection")} {selBounds.width} × {selBounds.height}
        </span>
      )}

      <FlexRow align="center" gap={1.5} sx={{ marginLeft: "auto" }}>
        <CostEstimateLine
          estimate={costEstimate}
          title={t("i18n-next52.sketch.status.cost")}
          ariaPrefix={t("i18n-next52.sketch.status.documentCost")}
        />
        <span>
          {t("i18n-next52.sketch.status.layer", { count: layerCount })}
        </span>
      </FlexRow>
    </StatusBar>
  );
};

export const ConnectedStatusBar = memo(ConnectedStatusBarInner);
ConnectedStatusBar.displayName = "ConnectedStatusBar";

export default ConnectedStatusBar;
