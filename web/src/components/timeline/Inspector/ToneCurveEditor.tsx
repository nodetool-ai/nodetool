/** @jsxImportSource @emotion/react */

import React, { memo, useCallback, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { CurvePoint } from "@nodetool-ai/timeline";

import {
  BORDER_RADIUS,
  Button,
  Caption,
  FlexColumn,
  FlexRow,
  SPACING,
  ToggleGroup,
  ToggleOption
} from "../../ui_primitives";
import { useBatchedGesture } from "../../../hooks/timeline/useBatchedGesture";

type CurveChannel = "master" | "r" | "g" | "b";

interface CurveUpdate {
  channel: CurveChannel;
  points: CurvePoint[] | undefined;
}

export interface ToneCurveEditorProps {
  master: readonly CurvePoint[];
  r?: readonly CurvePoint[];
  g?: readonly CurvePoint[];
  b?: readonly CurvePoint[];
  onPatch: (patch: Record<string, unknown>) => void;
}

const VIEW_SIZE = 100;
const MIN_POINT_GAP = 0.005;
const IDENTITY_POINTS: readonly CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 }
];

const CHANNELS: ReadonlyArray<{
  value: CurveChannel;
  label: string;
}> = [
  { value: "master", label: "Master" },
  { value: "r", label: "Red" },
  { value: "g", label: "Green" },
  { value: "b", label: "Blue" }
];

const graphStyles = css({
  width: "100%",
  aspectRatio: "1 / 1",
  borderRadius: BORDER_RADIUS.md,
  touchAction: "none",
  cursor: "crosshair"
});

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function editablePoints(
  points: readonly CurvePoint[] | undefined
): CurvePoint[] {
  if (!points || points.length < 2) {
    return IDENTITY_POINTS.map((point) => ({ ...point }));
  }
  const valid = points
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({ x: clamp(point.x), y: clamp(point.y) }))
    .sort((a, b) => a.x - b.x);
  return valid.length < 2
    ? IDENTITY_POINTS.map((point) => ({ ...point }))
    : valid;
}

function pointLabel(channel: string, point: CurvePoint, index: number): string {
  return `${channel} point ${index + 1}, input ${point.x.toFixed(2)}, output ${point.y.toFixed(2)}`;
}

const ToneCurveEditorInner: React.FC<ToneCurveEditorProps> = ({
  master,
  r,
  g,
  b,
  onPatch
}) => {
  const theme = useTheme();
  const [channel, setChannel] = useState<CurveChannel>("master");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const dragPointerRef = useRef<number | null>(null);
  const dragChangedRef = useRef(false);
  const draftPointsRef = useRef<CurvePoint[]>([]);
  const curves = { master, r, g, b };
  const points = editablePoints(curves[channel]);
  const channelLabel =
    CHANNELS.find((item) => item.value === channel)?.label ?? "Master";
  const curveColor =
    channel === "r"
      ? theme.vars.palette.error.main
      : channel === "g"
        ? theme.vars.palette.success.main
        : channel === "b"
          ? theme.vars.palette.info.main
          : theme.vars.palette.text.primary;

  const applyUpdate = useCallback(
    (update: CurveUpdate) => onPatch({ [update.channel]: update.points }),
    [onPatch]
  );
  const gesture = useBatchedGesture(applyUpdate);

  const eventPoint = useCallback(
    (clientX: number, clientY: number): CurvePoint => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) {
        return { x: 0, y: 0 };
      }
      return {
        x: clamp((clientX - rect.left) / rect.width),
        y: clamp(1 - (clientY - rect.top) / rect.height)
      };
    },
    []
  );

  const movePoint = useCallback(
    (
      source: readonly CurvePoint[],
      index: number,
      next: CurvePoint
    ): CurvePoint[] => {
      const lower = index === 0 ? 0 : source[index - 1].x + MIN_POINT_GAP;
      const upper =
        index === source.length - 1 ? 1 : source[index + 1].x - MIN_POINT_GAP;
      return source.map((point, pointIndex) =>
        pointIndex === index
          ? { x: Math.min(upper, Math.max(lower, next.x)), y: next.y }
          : point
      );
    },
    []
  );

  const handleSurfacePointerDown = useCallback(
    (event: React.PointerEvent<SVGRectElement>) => {
      if (event.button !== 0) {
        return;
      }
      const next = eventPoint(event.clientX, event.clientY);
      const existingIndex = points.findIndex(
        (point) => Math.abs(point.x - next.x) < MIN_POINT_GAP
      );
      const updated =
        existingIndex < 0
          ? [...points, next].sort((a, b) => a.x - b.x)
          : points.map((point, index) =>
              index === existingIndex ? { ...point, y: next.y } : point
            );
      onPatch({ [channel]: updated });
    },
    [channel, eventPoint, onPatch, points]
  );

  const handlePointPointerDown = useCallback(
    (event: React.PointerEvent<SVGCircleElement>, index: number) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      dragIndexRef.current = index;
      dragPointerRef.current = event.pointerId;
      dragChangedRef.current = false;
      draftPointsRef.current = points;
      svgRef.current?.setPointerCapture?.(event.pointerId);
      gesture.begin();
    },
    [gesture, points]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const index = dragIndexRef.current;
      if (index === null || dragPointerRef.current !== event.pointerId) {
        return;
      }
      const updated = movePoint(
        draftPointsRef.current,
        index,
        eventPoint(event.clientX, event.clientY)
      );
      draftPointsRef.current = updated;
      dragChangedRef.current = true;
      gesture.schedule({ channel, points: updated });
    },
    [channel, eventPoint, gesture, movePoint]
  );

  const finishDrag = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (
        dragIndexRef.current === null ||
        dragPointerRef.current !== event.pointerId
      ) {
        return;
      }
      svgRef.current?.releasePointerCapture?.(event.pointerId);
      if (dragChangedRef.current) {
        gesture.commit({ channel, points: draftPointsRef.current });
      } else {
        gesture.cancel();
      }
      dragIndexRef.current = null;
      dragPointerRef.current = null;
    },
    [channel, gesture]
  );

  const cancelDrag = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (dragPointerRef.current !== event.pointerId) {
        return;
      }
      gesture.cancel();
      dragIndexRef.current = null;
      dragPointerRef.current = null;
    },
    [gesture]
  );

  const removePoint = useCallback(
    (index: number) => {
      if (points.length <= 2) {
        return;
      }
      onPatch({
        [channel]: points.filter((_, pointIndex) => pointIndex !== index)
      });
    },
    [channel, onPatch, points]
  );

  const handlePointKeyDown = useCallback(
    (event: React.KeyboardEvent<SVGCircleElement>, index: number) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removePoint(index);
        return;
      }
      const step = event.shiftKey ? 0.05 : 0.01;
      const delta =
        event.key === "ArrowLeft"
          ? { x: -step, y: 0 }
          : event.key === "ArrowRight"
            ? { x: step, y: 0 }
            : event.key === "ArrowUp"
              ? { x: 0, y: step }
              : event.key === "ArrowDown"
                ? { x: 0, y: -step }
                : null;
      if (!delta) {
        return;
      }
      event.preventDefault();
      const point = points[index];
      onPatch({
        [channel]: movePoint(points, index, {
          x: clamp(point.x + delta.x),
          y: clamp(point.y + delta.y)
        })
      });
    },
    [channel, movePoint, onPatch, points, removePoint]
  );

  const reset = useCallback(() => {
    onPatch({
      [channel]:
        channel === "master"
          ? IDENTITY_POINTS.map((point) => ({ ...point }))
          : undefined
    });
  }, [channel, onPatch]);

  const path = points
    .map((point) => `${point.x * VIEW_SIZE},${(1 - point.y) * VIEW_SIZE}`)
    .join(" ");

  return (
    <FlexColumn gap={SPACING.md}>
      <FlexRow align="center" justify="space-between" gap={SPACING.md}>
        <ToggleGroup
          value={channel}
          exclusive
          quiet
          fullWidth
          aria-label="Curve channel"
          onChange={(_event, value: CurveChannel | null) => {
            if (value) {
              setChannel(value);
            }
          }}
        >
          {CHANNELS.map((item) => (
            <ToggleOption key={item.value} value={item.value}>
              {item.label}
            </ToggleOption>
          ))}
        </ToggleGroup>
        <Button size="small" variant="text" onClick={reset}>
          Reset
        </Button>
      </FlexRow>

      <svg
        ref={svgRef}
        css={graphStyles}
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        role="group"
        aria-label={`${channelLabel} tone curve`}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={cancelDrag}
      >
        <rect
          width={VIEW_SIZE}
          height={VIEW_SIZE}
          rx={2}
          fill={theme.vars.palette.background.paper}
          stroke={theme.vars.palette.divider}
          vectorEffect="non-scaling-stroke"
          onPointerDown={handleSurfacePointerDown}
        />
        {[25, 50, 75].map((position) => (
          <React.Fragment key={position}>
            <line
              x1={position}
              y1={0}
              x2={position}
              y2={VIEW_SIZE}
              stroke={theme.vars.palette.divider}
              strokeWidth={0.5}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            <line
              x1={0}
              y1={position}
              x2={VIEW_SIZE}
              y2={position}
              stroke={theme.vars.palette.divider}
              strokeWidth={0.5}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          </React.Fragment>
        ))}
        <line
          x1={0}
          y1={VIEW_SIZE}
          x2={VIEW_SIZE}
          y2={0}
          stroke={theme.vars.palette.text.disabled}
          strokeWidth={0.75}
          strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        <polyline
          points={path}
          fill="none"
          stroke={curveColor}
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        {points.map((point, index) => (
          <circle
            key={`${index}-${point.x}-${point.y}`}
            cx={point.x * VIEW_SIZE}
            cy={(1 - point.y) * VIEW_SIZE}
            r={3}
            fill={theme.vars.palette.background.paper}
            stroke={curveColor}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            role="button"
            tabIndex={0}
            aria-label={pointLabel(channelLabel, point, index)}
            onPointerDown={(event) => handlePointPointerDown(event, index)}
            onDoubleClick={() => removePoint(index)}
            onKeyDown={(event) => handlePointKeyDown(event, index)}
            style={{ cursor: "grab" }}
          />
        ))}
      </svg>

      <Caption color="muted">
        Click to add a point. Drag points to shape the curve. Double-click a
        point or press Delete to remove it.
      </Caption>
    </FlexColumn>
  );
};

export const ToneCurveEditor = memo(ToneCurveEditorInner);
ToneCurveEditor.displayName = "ToneCurveEditor";
