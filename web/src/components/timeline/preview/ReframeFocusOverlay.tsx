import React, { useRef } from "react";
import { useTheme } from "@mui/material/styles";

import type { ClipCrop, ClipTransform } from "@nodetool-ai/timeline";
import {
  layerCanvasAffine,
  PREVIEW_OVERLAY_Z
} from "@nodetool-ai/timeline/render";

interface ReframeGeometry {
  crop: ClipCrop;
  transform?: ClipTransform;
  parentMatrix?: Float32Array;
  sourceWidth: number;
  sourceHeight: number;
  sequenceWidth: number;
  sequenceHeight: number;
  frameWidth: number;
  frameHeight: number;
}

interface ReframeFocusOverlayProps {
  x: number;
  y: number;
  crop: ClipCrop;
  transform?: ClipTransform;
  parentMatrix?: Float32Array;
  sourceWidth: number;
  sourceHeight: number;
  sequenceWidth: number;
  sequenceHeight: number;
  frameWidth: number;
  frameHeight: number;
  onChange: (x: number, y: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function affineForReframe(geometry: ReframeGeometry) {
  const cropWidth = 1 - geometry.crop.left - geometry.crop.right;
  const cropHeight = 1 - geometry.crop.top - geometry.crop.bottom;
  return layerCanvasAffine(
    geometry.transform,
    geometry.sourceWidth * cropWidth,
    geometry.sourceHeight * cropHeight,
    {
      canvasWidth: geometry.frameWidth,
      canvasHeight: geometry.frameHeight,
      refWidth: geometry.sequenceWidth,
      refHeight: geometry.sequenceHeight
    },
    geometry.parentMatrix
  );
}

/** Map a source-normalized focus point to its displayed preview position. */
export function sourcePointToReframeViewport(
  x: number,
  y: number,
  geometry: ReframeGeometry
): { x: number; y: number } {
  const affine = affineForReframe(geometry);
  const localX = (x - geometry.crop.left) * geometry.sourceWidth;
  const localY = (y - geometry.crop.top) * geometry.sourceHeight;
  return {
    x: affine.a * localX + affine.c * localY + affine.e,
    y: affine.b * localX + affine.d * localY + affine.f
  };
}

/** Map a displayed preview position back into normalized source space. */
export function reframeViewportPointToSource(
  x: number,
  y: number,
  geometry: ReframeGeometry
): { x: number; y: number } {
  const affine = affineForReframe(geometry);
  const dx = x - affine.e;
  const dy = y - affine.f;
  const determinant = affine.a * affine.d - affine.b * affine.c;
  if (Math.abs(determinant) < Number.EPSILON) {
    return { x: 0.5, y: 0.5 };
  }
  const localX = (affine.d * dx - affine.c * dy) / determinant;
  const localY = (-affine.b * dx + affine.a * dy) / determinant;
  return {
    x: clamp01(geometry.crop.left + localX / geometry.sourceWidth),
    y: clamp01(geometry.crop.top + localY / geometry.sourceHeight)
  };
}

/** Drag target for authoring a framing correction at the current playhead. */
export function ReframeFocusOverlay({
  x,
  y,
  crop,
  transform,
  parentMatrix,
  sourceWidth,
  sourceHeight,
  sequenceWidth,
  sequenceHeight,
  frameWidth,
  frameHeight,
  onChange,
  onDragStart,
  onDragEnd
}: ReframeFocusOverlayProps): React.ReactElement | null {
  const theme = useTheme();
  const dragging = useRef(false);
  if (
    frameWidth <= 0 ||
    frameHeight <= 0 ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    return null;
  }
  const geometry: ReframeGeometry = {
    crop,
    transform,
    parentMatrix,
    sourceWidth,
    sourceHeight,
    sequenceWidth,
    sequenceHeight,
    frameWidth,
    frameHeight
  };

  const updateFromPointer = (
    event: React.PointerEvent<SVGSVGElement>
  ): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const source = reframeViewportPointToSource(
      ((event.clientX - rect.left) / rect.width) * frameWidth,
      ((event.clientY - rect.top) / rect.height) * frameHeight,
      geometry
    );
    onChange(source.x, source.y);
  };

  const begin = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragging.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onDragStart?.();
    updateFromPointer(event);
  };

  const move = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (!dragging.current) return;
    event.preventDefault();
    updateFromPointer(event);
  };

  const end = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (!dragging.current) return;
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onDragEnd?.();
  };

  const nudge = (event: React.KeyboardEvent<SVGSVGElement>): void => {
    const step = event.shiftKey ? 0.05 : 0.01;
    let nextX = x;
    let nextY = y;
    if (event.key === "ArrowLeft") nextX -= step;
    else if (event.key === "ArrowRight") nextX += step;
    else if (event.key === "ArrowUp") nextY -= step;
    else if (event.key === "ArrowDown") nextY += step;
    else return;
    event.preventDefault();
    onChange(clamp01(nextX), clamp01(nextY));
  };

  const displayed = sourcePointToReframeViewport(x, y, geometry);
  const cx = displayed.x;
  const cy = displayed.y;
  const radius = Math.max(8, Math.min(frameWidth, frameHeight) * 0.025);
  const stroke = theme.vars.palette.primary.main;

  return (
    <svg
      width={frameWidth}
      height={frameHeight}
      viewBox={`0 0 ${frameWidth} ${frameHeight}`}
      role="slider"
      aria-label="Reframe focus point"
      aria-valuetext={`${Math.round(x * 100)}%, ${Math.round(y * 100)}%`}
      tabIndex={0}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={nudge}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: PREVIEW_OVERLAY_Z.gizmo,
        cursor: dragging.current ? "grabbing" : "crosshair",
        touchAction: "none",
        color: stroke
      }}
    >
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      />
      <line
        x1={cx - radius * 1.5}
        y1={cy}
        x2={cx + radius * 1.5}
        y2={cy}
        stroke="currentColor"
        strokeWidth={2}
      />
      <line
        x1={cx}
        y1={cy - radius * 1.5}
        x2={cx}
        y2={cy + radius * 1.5}
        stroke="currentColor"
        strokeWidth={2}
      />
    </svg>
  );
}
