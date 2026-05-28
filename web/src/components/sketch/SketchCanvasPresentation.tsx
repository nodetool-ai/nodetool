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
import { FlexRow } from "../ui_primitives";
import type { Point, SketchTool } from "./types";
import SketchCanvasResizeHandles from "./SketchCanvasResizeHandles";
import { SKETCH_Z_INDEX, SKETCH_FONT } from "./sketchStyles";
import { selectionAntCanvasMarginCssPx } from "./sketchCanvasHooks";
import { cursorStyleForTool } from "./sketchCursorStyle";
import { TransformGizmo } from "./transform/gizmo/TransformGizmo";
import { SelectionActionBar } from "./SelectionActionBar";
import type { TransformTool } from "./tools/TransformTool";

export { cursorStyleForTool } from "./sketchCursorStyle";

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = (theme: Theme) =>
  css({
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "visible",
    backgroundColor: theme.vars.palette.grey[800],
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

// ─── Canvas transform style helper ──────────────────────────────────────────

export function canvasTransformStyle(pan: Point, zoom: number): React.CSSProperties {
  return {
    transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: "center center",
    imageRendering: "pixelated"
  };
}

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
  cursorDocPos: Point | null;

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
}

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
      cursorDocPos,
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
      className: rootClassName
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
            ...(backend === "webgpu" && !bootstrapPhaseActive ? {} : { visibility: "hidden" })
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
        {/* Canvas info bar */}
        <FlexRow
          className="sketch-canvas__info-bar"
          sx={{
            position: "absolute",
            bottom: 8,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(0,0,0,0.6)",
            color: "#ccc",
            padding: "2px 12px",
            borderRadius: "4px",
            fontSize: SKETCH_FONT.md,
            fontFamily: SKETCH_FONT.familyMono,
            pointerEvents: "none",
            zIndex: 5,
            gap: "12px"
          }}
        >
          <span>{canvasWidth} × {canvasHeight}</span>
          <span>{Math.round(zoom * 100)}%</span>
          {cursorDocPos !== null && (
            <span style={{ fontSize: SKETCH_FONT.sm, minWidth: 65 }}>
              {cursorDocPos.x}, {cursorDocPos.y}
            </span>
          )}
        </FlexRow>
      </div>
    );
  }
);

export default SketchCanvasPresentation;
