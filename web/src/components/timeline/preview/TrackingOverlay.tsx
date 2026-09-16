import React, { useEffect, useId, useRef, useState } from "react";
import type { ClipCrop, ClipTransform } from "@nodetool-ai/timeline";
import { PREVIEW_OVERLAY_Z } from "@nodetool-ai/timeline/render";
import { Box, SPACING } from "../../ui_primitives";
import {
  reframeViewportPointToSource,
  sourcePointToReframeViewport
} from "./ReframeFocusOverlay";
import type { TrackingRectangle } from "./useTrackingSelection";

interface TrackingOverlayProps {
  region: TrackingRectangle | null;
  crop: ClipCrop;
  transform?: ClipTransform;
  parentMatrix?: Float32Array;
  sourceWidth: number;
  sourceHeight: number;
  sequenceWidth: number;
  sequenceHeight: number;
  frameWidth: number;
  frameHeight: number;
  onChange?: (region: TrackingRectangle | null) => void;
  onCancel?: () => void;
}

const MIN_SIZE = 0.01;
const DEFAULT_REGION = { x: 0.4, y: 0.4, width: 0.2, height: 0.2 };
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/** Select a source-normalized rectangle through the same transform as the preview. */
export function TrackingOverlay(
  props: TrackingOverlayProps
): React.ReactElement | null {
  const { region, onChange, onCancel, frameWidth, frameHeight } = props;
  const descriptionId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const interactive = onChange !== undefined;
  useEffect(() => {
    if (interactive) {
      svgRef.current?.focus();
    }
  }, [interactive]);
  const [draft, setDraft] = useState<TrackingRectangle | null>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  if (
    frameWidth <= 0 ||
    frameHeight <= 0 ||
    props.sourceWidth <= 0 ||
    props.sourceHeight <= 0
  ) {
    return null;
  }
  const rectangle = draft ?? region;
  const corners = rectangle
    ? [
        [rectangle.x, rectangle.y],
        [rectangle.x + rectangle.width, rectangle.y],
        [rectangle.x + rectangle.width, rectangle.y + rectangle.height],
        [rectangle.x, rectangle.y + rectangle.height]
      ].map(([x, y]) => sourcePointToReframeViewport(x, y, props))
    : [];

  const point = (
    event: React.PointerEvent<SVGSVGElement>
  ): { x: number; y: number } => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return reframeViewportPointToSource(
      ((event.clientX - bounds.left) * frameWidth) / bounds.width,
      ((event.clientY - bounds.top) * frameHeight) / bounds.height,
      props
    );
  };
  const rectangleAt = (
    event: React.PointerEvent<SVGSVGElement>
  ): TrackingRectangle | null => {
    const start = drag.current;
    if (!start || event.pointerId !== start.pointerId) {
      return null;
    }
    const end = point(event);
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y)
    };
  };
  const cancel = (): void => {
    drag.current = null;
    setDraft(null);
  };
  const nudge = (event: React.KeyboardEvent<SVGSVGElement>): void => {
    if (!onChange) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      onCancel?.();
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      event.stopPropagation();
      onChange(null);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onChange(region ?? DEFAULT_REGION);
      return;
    }
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const box = region ?? DEFAULT_REGION;
    const step = event.shiftKey ? 0.05 : 0.01;
    const dx =
      event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy =
      event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    onChange(
      event.altKey
        ? {
            ...box,
            width: clamp(box.width + dx, MIN_SIZE, 1 - box.x),
            height: clamp(box.height + dy, MIN_SIZE, 1 - box.y)
          }
        : {
            ...box,
            x: clamp(box.x + dx, 0, 1 - box.width),
            y: clamp(box.y + dy, 0, 1 - box.height)
          }
    );
  };
  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: PREVIEW_OVERLAY_Z.gizmo,
        color: "primary.main",
        "& svg:focus-visible": {
          outline: "solid",
          outlineColor: "primary.main",
          outlineWidth: SPACING.micro
        }
      }}
    >
      <svg
        ref={svgRef}
        width={frameWidth}
        height={frameHeight}
        viewBox={`0 0 ${frameWidth} ${frameHeight}`}
        role={onChange ? "group" : "img"}
        aria-label={onChange ? "Select tracking subject" : "Tracked subject"}
        aria-describedby={descriptionId}
        tabIndex={onChange ? 0 : undefined}
        style={{
          pointerEvents: onChange ? "auto" : "none",
          touchAction: "none",
          cursor: onChange ? "crosshair" : undefined
        }}
        onKeyDown={nudge}
        onPointerDown={(event) => {
          if (!onChange || event.button !== 0 || drag.current) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus();
          drag.current = { ...point(event), pointerId: event.pointerId };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const next = rectangleAt(event);
          if (next) {
            setDraft(next);
          }
        }}
        onPointerUp={(event) => {
          const next = rectangleAt(event);
          if (!next) {
            return;
          }
          cancel();
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          if (next.width >= MIN_SIZE && next.height >= MIN_SIZE) {
            onChange?.(next);
          }
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
      >
        <desc id={descriptionId}>
          Drag around a subject. Enter creates a box. Arrow keys move it. Alt
          and arrow keys resize it. Shift uses larger steps. Delete clears it.
          Escape stops selection.
        </desc>
        {rectangle && (
          <polygon
            points={corners.map(({ x, y }) => `${x},${y}`).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          />
        )}
      </svg>
    </Box>
  );
}
