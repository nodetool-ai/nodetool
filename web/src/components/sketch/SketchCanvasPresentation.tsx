/**
 * SketchCanvasPresentation
 *
 * Purely presentational layer extracted from SketchCanvas.
 * Renders the stacked canvas elements (bootstrap, display, overlay,
 * selection, cursor, gizmo), resize handles, and the info bar.
 *
 * No new state ownership — receives all layout/chrome data as props.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo } from "react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { FlexRow, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import { useSketchStore } from "./state";
import type { Point, SketchTool } from "./types";
import SketchCanvasResizeHandles from "./SketchCanvasResizeHandles";
import { SKETCH_Z_INDEX, SKETCH_FONT } from "./sketchStyles";
import { selectionAntCanvasMarginCssPx } from "./sketchCanvasHooks";
import { TransformGizmo } from "./transform/gizmo/TransformGizmo";
import { SelectionActionBar } from "./SelectionActionBar";
import type { TransformTool } from "./tools/TransformTool";
import { canvasTransformStyle } from "./sketchCanvasPresentation.helpers";

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = (theme: Theme) =>
  css({
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "visible",
    // Match the node editor's canvas backdrop: near-black base with a faint
    // dotted grid. Uses the same theme tokens as ReactFlow's background so it
    // tracks light/dark identically.
    backgroundColor: theme.vars.palette.c_editor_bg_color,
    backgroundImage: `radial-gradient(${theme.vars.palette.c_editor_grid_color} 1px, transparent 1px)`,
    backgroundSize: "25px 25px",
    touchAction: "none",
    overscrollBehaviorX: "none",
    overscrollBehaviorY: "contain",
    "& canvas": {
      position: "absolute",
      top: "50%",
      left: "50%",
      imageRendering: "pixelated",
      touchAction: "none"
    },
    "& .sketch-canvas__doc-stack": {
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      pointerEvents: "none"
    },
    "& .cursor-overlay": {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: SKETCH_Z_INDEX.overlay,
      imageRendering: "auto"
    }
  });

// ─── Props ───────────────────────────────────────────────────────────────────

export interface SketchCanvasPresentationProps {
  // ── Refs (assigned by orchestration) ──────────────────────────────
  containerRef: React.RefObject<HTMLDivElement | null>;
  bootstrapDisplayRef: React.RefObject<HTMLCanvasElement | null>;
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  selectionGpuCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  selectionCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  cursorCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  gizmoCanvasRef: React.RefObject<HTMLCanvasElement | null>;

  /** TransformTool singleton — drives the React SVG gizmo. */
  transformTool: TransformTool;

  // ── Layout data ────────────────────────────────────────────────────
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
  pan: Point;
  interactionTool: SketchTool;
  /** Resolved CSS cursor for the root container (tool + pan modifiers). */
  containerCursor: string;
  bootstrapPhaseActive: boolean;
  backend: "webgpu" | "canvas2d";

  // ── Info bar data ──────────────────────────────────────────────────
  /**
   * Floating bottom-center info pill (dimensions / zoom / cursor). Defaults to
   * true; the standalone editor hides it because its full-width status bar
   * already shows this information.
   */
  showInfoBar?: boolean;

  // ── Event handlers (from orchestration / SketchCanvas) ─────────────
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onPointerLeave: () => void;
  onMouseLeave: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;

  // ── Optional chrome ────────────────────────────────────────────────
  onCanvasResizeStart?: () => void;
  onCanvasResize?: (
    width: number,
    height: number,
    options?: { translateLayers?: Point; resizeFromCenter?: boolean }
  ) => void;
  className?: string;
  /**
   * Document-space chrome rendered above the layer pixels and below the
   * selection/cursor/gizmo canvases. Positioned children use raw document
   * coordinates — the shared pan/zoom transform maps them onto the artboard.
   */
  docOverlay?: React.ReactNode;
}

// ─── Cursor readout ──────────────────────────────────────────────────────────

/**
 * Subscribes to the store cursor position itself so pointer moves re-render
 * only this span — not the canvas component tree.
 */
const CursorPosReadout = memo(function CursorPosReadout() {
  const cursorDocPos = useSketchStore((s) => s.cursorDocPos);
  if (cursorDocPos === null) {
    return null;
  }
  return (
    <span style={{ fontSize: SKETCH_FONT.sm, minWidth: 65 }}>
      {cursorDocPos.x}, {cursorDocPos.y}
    </span>
  );
});

// ─── Component ───────────────────────────────────────────────────────────────

const SketchCanvasPresentation = memo<SketchCanvasPresentationProps>(
  function SketchCanvasPresentation(props) {
    const {
      containerRef,
      bootstrapDisplayRef,
      displayCanvasRef,
      overlayCanvasRef,
      selectionGpuCanvasRef,
      selectionCanvasRef,
      cursorCanvasRef,
      gizmoCanvasRef,
      transformTool,
      canvasWidth,
      canvasHeight,
      zoom,
      pan,
      containerCursor,
      bootstrapPhaseActive,
      backend,
      showInfoBar = true,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onDoubleClick,
      onPointerLeave,
      onMouseLeave,
      onContextMenu,
      onDragOver,
      onDrop,
      onCanvasResizeStart,
      onCanvasResize,
      className: rootClassName,
      docOverlay
    } = props;

    const theme = useTheme();
    const canvasStyle = canvasTransformStyle(pan, zoom);
    const selectionAntMarginPx = selectionAntCanvasMarginCssPx(zoom);

    return (
      <div
        ref={containerRef}
        className={
          rootClassName ? `sketch-canvas ${rootClassName}` : "sketch-canvas"
        }
        css={styles(theme)}
        style={{ cursor: containerCursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onPointerLeave={onPointerLeave}
        onMouseLeave={onMouseLeave}
        onContextMenu={onContextMenu}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div className="sketch-canvas__doc-stack">
          <canvas
            ref={bootstrapDisplayRef}
            className="sketch-canvas__bootstrap"
            width={canvasWidth}
            height={canvasHeight}
            style={{
              ...canvasStyle,
              pointerEvents: "none",
              ...(bootstrapPhaseActive ? {} : { visibility: "hidden" })
            }}
          />
          <canvas
            ref={displayCanvasRef}
            className="sketch-canvas__display"
            width={canvasWidth}
            height={canvasHeight}
            style={{
              ...canvasStyle,
              pointerEvents: "none",
              ...(bootstrapPhaseActive ? { opacity: 0 } : {})
            }}
          />
          {/* Overlay canvas for shape/gradient/crop preview (document space). */}
          <canvas
            ref={overlayCanvasRef}
            className="sketch-canvas__overlay"
            width={canvasWidth}
            height={canvasHeight}
            style={{
              ...canvasStyle,
              pointerEvents: "none",
              imageRendering: "auto"
            }}
          />
          {/* Document-space DOM overlay (e.g. generation effects). Shares the
              canvas transform so its children position in document pixels. */}
          {docOverlay && (
            <div
              className="sketch-canvas__doc-overlay"
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: canvasWidth,
                height: canvasHeight,
                transform: canvasStyle.transform,
                transformOrigin: "center center",
                pointerEvents: "none"
              }}
            >
              {docOverlay}
            </div>
          )}
        </div>
        {/* Screen-resolution canvas for selection marching ants. */}
        <canvas
          ref={selectionGpuCanvasRef}
          className="sketch-canvas__selection-gpu cursor-overlay"
          style={{
            top: -selectionAntMarginPx,
            left: -selectionAntMarginPx,
            width: `calc(100% + ${2 * selectionAntMarginPx}px)`,
            height: `calc(100% + ${2 * selectionAntMarginPx}px)`,
            ...(backend === "webgpu" && !bootstrapPhaseActive
              ? {}
              : { visibility: "hidden" })
          }}
        />
        <canvas
          ref={selectionCanvasRef}
          className="sketch-canvas__selection cursor-overlay"
          style={{
            top: -selectionAntMarginPx,
            left: -selectionAntMarginPx,
            width: `calc(100% + ${2 * selectionAntMarginPx}px)`,
            height: `calc(100% + ${2 * selectionAntMarginPx}px)`
          }}
        />
        {/* Cursor canvas for brush size preview */}
        <canvas
          ref={cursorCanvasRef}
          className="sketch-canvas__cursor cursor-overlay"
        />
        {/* Gizmo canvas — MoveTool / CropTool still paint here imperatively. */}
        <canvas
          ref={gizmoCanvasRef}
          className="sketch-canvas__gizmo cursor-overlay"
        />
        {/* React/SVG gizmo for the TransformTool (declarative, viewport-aware). */}
        <TransformGizmo containerRef={containerRef} tool={transformTool} />
        {/* Floating contextual toolbar anchored to the active selection. */}
        <SelectionActionBar containerRef={containerRef} />
        {/* Canvas resize handles */}
        {onCanvasResize && (
          <SketchCanvasResizeHandles
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            zoom={zoom}
            pan={pan}
            onResizeStart={onCanvasResizeStart}
            onResize={onCanvasResize}
          />
        )}
        {/* Canvas info bar — hidden in the standalone editor, which uses the
            full-width status bar instead. */}
        {showInfoBar && (
          <FlexRow
            className="sketch-canvas__info-bar"
            sx={{
              position: "absolute",
              bottom: 8,
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "var(--palette-c_scrim)",
              color: "var(--palette-grey-200)",
              padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.lg)}`,
              borderRadius: BORDER_RADIUS.sm,
              fontSize: SKETCH_FONT.md,
              fontFamily: SKETCH_FONT.familyMono,
              pointerEvents: "none",
              zIndex: 5,
              gap: getSpacingPx(SPACING.lg)
            }}
          >
            <span>
              {canvasWidth} × {canvasHeight}
            </span>
            <span>{Math.round(zoom * 100)}%</span>
            <CursorPosReadout />
          </FlexRow>
        )}
      </div>
    );
  }
);

export default SketchCanvasPresentation;
