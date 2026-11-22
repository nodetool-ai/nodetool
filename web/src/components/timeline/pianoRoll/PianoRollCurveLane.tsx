/** @jsxImportSource @emotion/react */
/**
 * The curve lane under the note grid: edits one controller lane of the clip or
 * one expression curve of the selected note.
 *
 * Click adds a point (snapped to the grid, Ctrl/Cmd bypasses the snap), a drag
 * moves a point, Shift-drag draws points at grid steps, Delete or a double
 * click removes a point. The parent opens and closes the undo batch around a
 * gesture, so a whole drag is one undo entry, as for the velocity lane.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useColorScheme, useTheme } from "@mui/material/styles";

import { createTimeOrderedUuid } from "@nodetool-ai/timeline";

import { pickPianoRollColors } from "./pianoRollColors";
import {
  snapTickToGrid,
  tickToX,
  xToTick,
  type PianoRollGeometry
} from "./pianoRollGeometry";
import {
  hitTestCurvePoint,
  valueToY,
  yToValue,
  type CurvePoint,
  type LaneCurve
} from "./pianoRollLanes";

/** Height of the lane's drawing area. */
export const CURVE_LANE_HEIGHT_PX = 56;
const POINT_HALF_PX = 3;
/** The distance a press on a point travels before it becomes a drag. */
const DRAG_THRESHOLD_PX = 3;

const canvasStyles = css({
  display: "block",
  width: "100%",
  cursor: "crosshair",
  touchAction: "none",
  outline: "none"
});

interface Props {
  curve: LaneCurve;
  geometry: PianoRollGeometry;
  widthPx: number;
  gridStepTicks: number;
  gridPhaseTick: number;
  snapEnabled: boolean;
  windowFromTick: number;
  windowToTick: number;
  /** Content ticks the lane's subject covers (a note's extent), shaded behind the curve. */
  extent?: { startTick: number; endTick: number };
  ariaLabel: string;
  onGestureStart: () => void;
  onGestureEnd: () => void;
  /** The whole point list after an edit. */
  onChange: (points: CurvePoint[]) => void;
}

type Gesture =
  | {
      kind: "drag";
      id: string;
      /** The points at press, without any edit the drag made. */
      base: CurvePoint[];
      startX: number;
      startY: number;
      /** Whether the gesture has opened the undo batch. */
      begun: boolean;
    }
  | { kind: "draw"; points: CurvePoint[]; lastTick: number | null };

export const PianoRollCurveLane: React.FC<Props> = memo(
  ({
    curve,
    geometry,
    widthPx,
    gridStepTicks,
    gridPhaseTick,
    snapEnabled,
    windowFromTick,
    windowToTick,
    extent,
    ariaLabel,
    onGestureStart,
    onGestureEnd,
    onChange
  }) => {
    const theme = useTheme();
    const { t } = useTranslation();
    const { mode, systemMode } = useColorScheme();
    const activeMode = (mode === "system" ? systemMode : mode) ?? "dark";
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const gestureRef = useRef<Gesture | null>(null);
    // Selected by tick: a curve holds one point per tick, and an expression
    // curve has no stable ids across renders.
    const [selectedTick, setSelectedTick] = useState<number | null>(null);
    const curveRef = useRef(curve);
    curveRef.current = curve;
    // The point the last click added, so the double click it starts keeps it.
    const lastAddedRef = useRef<string | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || widthPx <= 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const colors = pickPianoRollColors(
        theme,
        activeMode === "light" ? "light" : "dark"
      );
      const dpr =
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      canvas.width = widthPx * dpr;
      canvas.height = CURVE_LANE_HEIGHT_PX * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const h = CURVE_LANE_HEIGHT_PX;
      ctx.fillStyle = colors.whiteRow;
      ctx.fillRect(0, 0, widthPx, h);
      if (extent) {
        ctx.fillStyle = colors.marquee;
        const x0 = tickToX(extent.startTick, geometry);
        const x1 = tickToX(extent.endTick, geometry);
        ctx.fillRect(x0, 0, Math.max(1, x1 - x0), h);
      }
      const windowStartX = tickToX(windowFromTick, geometry);
      const windowEndX = tickToX(windowToTick, geometry);
      ctx.fillStyle = colors.outsideWindow;
      if (windowStartX > 0) ctx.fillRect(0, 0, windowStartX, h);
      if (windowEndX < widthPx) ctx.fillRect(windowEndX, 0, widthPx - windowEndX, h);

      // The resting value: the lane's centre or neutral line.
      const restValue =
        curve.neutral ?? (curve.min < 0 ? 0 : curve.min);
      ctx.strokeStyle = colors.gridLine;
      ctx.beginPath();
      const restY = Math.round(valueToY(restValue, curve, h)) + 0.5;
      ctx.moveTo(0, restY);
      ctx.lineTo(widthPx, restY);
      ctx.stroke();

      const pts = curve.points;
      if (pts.length === 0) return;
      const xy = (p: CurvePoint): [number, number] => [
        tickToX(curve.originTick + p.tick, geometry),
        valueToY(p.value, curve, h)
      ];
      ctx.strokeStyle = colors.note;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let [x, y] = xy(pts[0]);
      if (curve.neutral !== null) {
        ctx.moveTo(Math.min(x, 0), valueToY(curve.neutral, curve, h));
        ctx.lineTo(x, valueToY(curve.neutral, curve, h));
        ctx.lineTo(x, y);
      } else {
        ctx.moveTo(x, y);
      }
      for (let i = 1; i < pts.length; i++) {
        const [nx, ny] = xy(pts[i]);
        if (curve.step) ctx.lineTo(nx, y);
        ctx.lineTo(nx, ny);
        x = nx;
        y = ny;
      }
      ctx.lineTo(Math.max(widthPx, x), y);
      ctx.stroke();
      ctx.lineWidth = 1;
      for (const p of pts) {
        const [px, py] = xy(p);
        if (px < -POINT_HALF_PX || px > widthPx + POINT_HALF_PX) continue;
        ctx.fillStyle =
          p.tick === selectedTick ? colors.noteSelected : colors.note;
        ctx.fillRect(
          px - POINT_HALF_PX,
          py - POINT_HALF_PX,
          POINT_HALF_PX * 2,
          POINT_HALF_PX * 2
        );
      }
    }, [
      theme,
      activeMode,
      curve,
      geometry,
      widthPx,
      windowFromTick,
      windowToTick,
      extent,
      selectedTick
    ]);

    const localTick = useCallback(
      (x: number, bypassSnap: boolean): number => {
        const c = curveRef.current;
        const content = xToTick(x, geometry);
        const snapped =
          snapEnabled && !bypassSnap
            ? snapTickToGrid(content, gridStepTicks, gridPhaseTick)
            : Math.round(content);
        const local = Math.max(0, snapped - c.originTick);
        return c.maxTick === null ? local : Math.min(c.maxTick, local);
      },
      [geometry, gridPhaseTick, gridStepTicks, snapEnabled]
    );

    const withPoint = (
      base: CurvePoint[],
      id: string,
      tick: number,
      value: number
    ): CurvePoint[] => {
      // One point per tick: a point on another's tick hides it while it stays.
      const rest = base.filter((p) => p.id !== id && p.tick !== tick);
      return [...rest, { id, tick, value }];
    };

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.currentTarget.focus();
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const c = curveRef.current;
        const bypass = e.ctrlKey || e.metaKey;
        const hit = hitTestCurvePoint(c, x, y, geometry, CURVE_LANE_HEIGHT_PX);
        let gesture: Gesture;
        if (hit) {
          setSelectedTick(c.points.find((p) => p.id === hit)?.tick ?? null);
          if (hit !== lastAddedRef.current) lastAddedRef.current = null;
          gesture = {
            kind: "drag",
            id: hit,
            base: [...c.points],
            startX: e.clientX,
            startY: e.clientY,
            begun: false
          };
        } else if (e.shiftKey) {
          const tick = localTick(x, bypass);
          const value = yToValue(y, c, CURVE_LANE_HEIGHT_PX);
          const id = createTimeOrderedUuid();
          const base = c.points.filter((p) => p.tick !== tick);
          const points = [...base, { id, tick, value }];
          gesture = { kind: "draw", points, lastTick: tick };
          onGestureStart();
          onChange(points);
        } else {
          const tick = localTick(x, bypass);
          const value = yToValue(y, c, CURVE_LANE_HEIGHT_PX);
          const existing = c.points.find((p) => p.tick === tick);
          const id = existing?.id ?? createTimeOrderedUuid();
          const points = existing
            ? c.points.map((p) => (p.id === id ? { ...p, value } : p))
            : [...c.points, { id, tick, value }];
          setSelectedTick(tick);
          lastAddedRef.current = existing ? null : id;
          gesture = {
            kind: "drag",
            id,
            base: [...c.points],
            startX: e.clientX,
            startY: e.clientY,
            begun: true
          };
          onGestureStart();
          onChange(points);
        }
        gestureRef.current = gesture;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // No capture: the drag still works while the pointer stays inside.
        }
      },
      [geometry, localTick, onChange, onGestureStart]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        const gesture = gestureRef.current;
        if (!gesture) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const c = curveRef.current;
        const bypass = e.ctrlKey || e.metaKey;
        const tick = localTick(x, bypass);
        const value = yToValue(y, c, CURVE_LANE_HEIGHT_PX);
        if (gesture.kind === "drag") {
          if (!gesture.begun) {
            if (
              Math.abs(e.clientX - gesture.startX) < DRAG_THRESHOLD_PX &&
              Math.abs(e.clientY - gesture.startY) < DRAG_THRESHOLD_PX
            ) {
              return;
            }
            gesture.begun = true;
            lastAddedRef.current = null;
            onGestureStart();
          }
          setSelectedTick(tick);
          onChange(withPoint(gesture.base, gesture.id, tick, value));
          return;
        }
        // Freehand: a point at every grid step the pointer crossed.
        const from = gesture.lastTick ?? tick;
        const step =
          snapEnabled && !bypass && gridStepTicks > 0 ? gridStepTicks : 0;
        const ticks: number[] = [];
        if (step === 0) {
          ticks.push(tick);
        } else {
          const dir = tick >= from ? 1 : -1;
          for (let k = from; dir > 0 ? k <= tick : k >= tick; k += dir * step) {
            ticks.push(Math.round(k));
            if (ticks.length > 2048) break;
          }
          if (ticks.length === 0 || ticks[ticks.length - 1] !== tick) ticks.push(tick);
        }
        let points = gesture.points;
        for (const k of ticks) {
          points = points.filter((p) => p.tick !== k);
          points = [...points, { id: createTimeOrderedUuid(), tick: k, value }];
        }
        gesture.points = points;
        gesture.lastTick = tick;
        onChange(points);
      },
      [gridStepTicks, localTick, onChange, onGestureStart, snapEnabled]
    );

    const handlePointerUp = useCallback(() => {
      const gesture = gestureRef.current;
      if (!gesture) return;
      gestureRef.current = null;
      if (gesture.kind === "draw" || gesture.begun) onGestureEnd();
    }, [onGestureEnd]);

    const removePoint = useCallback(
      (id: string) => {
        onChange(curveRef.current.points.filter((p) => p.id !== id));
        setSelectedTick(null);
      },
      [onChange]
    );

    const handleDoubleClick = useCallback(
      (e: React.MouseEvent<HTMLCanvasElement>) => {
        e.stopPropagation();
        const gesture = gestureRef.current;
        gestureRef.current = null;
        if (gesture && (gesture.kind === "draw" || gesture.begun)) onGestureEnd();
        const rect = e.currentTarget.getBoundingClientRect();
        const hit = hitTestCurvePoint(
          curveRef.current,
          e.clientX - rect.left,
          e.clientY - rect.top,
          geometry,
          CURVE_LANE_HEIGHT_PX
        );
        if (!hit) return;
        if (hit === lastAddedRef.current) {
          lastAddedRef.current = null;
          return;
        }
        removePoint(hit);
      },
      [geometry, onGestureEnd, removePoint]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLCanvasElement>) => {
        if (e.key !== "Delete" && e.key !== "Backspace") return;
        // A key press in the lane never reaches the note grid's delete.
        e.preventDefault();
        e.stopPropagation();
        const point = curveRef.current.points.find((p) => p.tick === selectedTick);
        if (point) removePoint(point.id);
      },
      [removePoint, selectedTick]
    );

    return (
      <canvas
        ref={canvasRef}
        css={canvasStyles}
        style={{ height: CURVE_LANE_HEIGHT_PX }}
        tabIndex={0}
        role="application"
        data-testid="piano-roll-curve-lane"
        aria-label={ariaLabel}
        title={t("pass3_20.pianoRoll.lanes.hint")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
      />
    );
  }
);

PianoRollCurveLane.displayName = "PianoRollCurveLane";
