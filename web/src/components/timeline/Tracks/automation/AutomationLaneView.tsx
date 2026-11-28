/** @jsxImportSource @emotion/react */
/**
 * AutomationLaneView — one automation lane under its track: the curve over
 * document time and its points.
 *
 * Click the lane to add a point there and keep dragging to place it. Drag a
 * point to move it (Shift keeps its time), double-click or press Delete to
 * remove it, and right-click it for the easing of the segment arriving at it.
 * Every gesture is one undo step.
 *
 * The same view draws the curve on a track's main lane (`variant="overlay"`,
 * over the clips, with the pointer only on the parts of the lane that are not
 * a clip's name bar) and a sub-lane under the track. A parameter without a
 * lane draws a flat line at the control's own value; the first click creates
 * the lane.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import {
  addAutomationPoint,
  automationBreakpoints,
  automationModeOf,
  automationModePlays,
  automationValueAt,
  createAutomationLane,
  findAutomationLane,
  moveAutomationPoint,
  removeAutomationPoints,
  setAutomationPointEasing,
  type AutomationColorRole,
  type AutomationLane,
  type AutomationPoint,
  type AutomationTarget,
  type TimelineTrack
} from "@nodetool-ai/timeline";

import { useTimelineStore, useTimelineStoreApi } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { useSettingsStore } from "../../../../stores/SettingsStore";
import { formatActionShortcut } from "../../timelineKeymap";
import { useTimelineHistoryBatch } from "../../../../stores/timeline/useTimelineHistoryBatch";
import {
  BORDER_RADIUS,
  ContextMenu,
  FONT_SIZE_MONO,
  MenuItemPrimitive,
  MOTION,
  SPACING,
  Z_INDEX,
  getSpacingPx
} from "../../../ui_primitives";
import {
  AUTOMATION_LANE_HEIGHT_PX,
  automationHitRects,
  CLIP_NAME_BAR_BOTTOM_PX
} from "./automationLayout";
import {
  automationNormToValue,
  automationTargetSpec,
  automationValueToNorm,
  type AutomationTargetSpec
} from "./automationTargets";

/** Vertical inset of the curve, so a point at either extreme stays clickable. */
const INSET_PX = 6;
/** How close (px) a press must land to a point to grab it. */
const HIT_PX = 7;
/** Diameter of a point. */
const POINT_PX = 6;
/** Height of the bar under a selected point. */
const SELECTED_BAR_PX = 2;
/** The curve is dimmed over clips by this share, toward the lane background. */
const CLIP_DIM_OPACITY = 0.5;
/** A quiet lane tint, so the curve and points carry the parameter color. */
const TINT_OPACITY = 0.05;
/** Width and strength of the halo under the curve on a main lane. */
const HALO_PX = 4;
const HALO_OPACITY = 0.7;

const laneStyles = (theme: Theme, heightPx: number) =>
  css({
    position: "relative",
    width: "100%",
    height: heightPx,
    flexShrink: 0,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    background: theme.vars.palette.background.default,
    overflow: "hidden",
    touchAction: "none",
    outline: "none",
    "&:focus-visible": {
      boxShadow: `inset 0 0 0 1px ${theme.vars.palette.primary.main}`
    },
    "& svg": { position: "absolute", inset: 0, pointerEvents: "none" }
  });

/** The curve over a main lane: it covers the lane and takes the pointer only on its hit rects. */
const overlayStyles = css({
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
  outline: "none",
  // Above the clips' handles, so the curve takes the pointer where it draws.
  zIndex: Z_INDEX.base + 5,
  "& svg": { position: "absolute", inset: 0, pointerEvents: "none" },
  "& .hit": { position: "absolute", touchAction: "none", pointerEvents: "auto" }
});

const pointStyles = (theme: Theme, color: string) =>
  css({
    position: "absolute",
    pointerEvents: "none",
    width: POINT_PX,
    height: POINT_PX,
    marginLeft: -POINT_PX / 2,
    marginTop: -POINT_PX / 2,
    borderRadius: BORDER_RADIUS.circle,
    border: `1px solid ${theme.vars.palette.background.default}`,
    background: color,
    zIndex: Z_INDEX.base + 1,
    transition: MOTION.transform,
    "&.is-hover": { transform: "scale(1.5)" },
    "&.is-selected": {
      background: theme.vars.palette.text.primary,
      boxShadow: `0 0 0 1px ${color}`
    },
    "&.is-off": { background: theme.vars.palette.text.disabled }
  });

/** The bar at the lane's foot under a selected point. */
const selectedBarStyles = (color: string) =>
  css({
    position: "absolute",
    bottom: 0,
    width: POINT_PX * 2,
    height: SELECTED_BAR_PX,
    marginLeft: -POINT_PX,
    background: color,
    pointerEvents: "none"
  });

/** The selection box: a 1px dashed frame, no fill (spec 1.3). */
const boxStyles = (theme: Theme) =>
  css({
    position: "absolute",
    border: `1px dashed ${theme.vars.palette.text.secondary}`,
    pointerEvents: "none",
    zIndex: Z_INDEX.base + 2
  });

const readoutStyles = (theme: Theme) =>
  css({
    position: "absolute",
    padding: `0 ${getSpacingPx(SPACING.xs)}`,
    borderRadius: BORDER_RADIUS.sm,
    background: theme.vars.palette.background.paper,
    color: theme.vars.palette.text.primary,
    fontSize: FONT_SIZE_MONO.caption,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    zIndex: Z_INDEX.base + 2
  });

interface AutomationLaneViewProps {
  track: TimelineTrack;
  /** The lane to edit. Missing on a main lane whose parameter has none yet. */
  lane?: AutomationLane;
  /** The parameter. Defaults to the lane's target. */
  target?: AutomationTarget;
  /** Width of the lanes' content, so the curve runs to the end of it. */
  widthPx: number;
  /** `lane` is a sub-lane under the track, `overlay` the curve on the main lane. */
  variant?: "lane" | "overlay";
  /** Height of the lane in px. */
  heightPx?: number;
  /** Theme role of the curve and its dots. */
  colorRole?: AutomationColorRole;
  /** The track's clips, for the overlay's dimming and its pointer areas. */
  clips?: readonly { startMs: number; durationMs: number }[];
}

/** A press that moves the selected points, draws a selection box, or bends a segment. */
type Drag =
  | {
      kind: "move";
      pointerId: number;
      /** The point under the pointer, for the value tag. */
      grab: number;
      startX: number;
      startY: number;
      /** The points and the selection when the drag began. */
      base: AutomationPoint[];
      selection: number[];
    }
  | { kind: "box"; pointerId: number; x0: number; y0: number; initial: number[] }
  | { kind: "bend"; pointerId: number; index: number; startY: number; base: AutomationPoint[] };

/** Pointer travel (px) before a bend picks an easing. */
const BEND_SLOP_PX = 4;

/**
 * The selected points moved together by `dtMs` and `dNorm` (a share of the
 * lane's range). The time shift stops where a selected point would pass an
 * unselected neighbour, so the order of the points never changes.
 */
export function moveAutomationSelection(
  base: readonly AutomationPoint[],
  selection: readonly number[],
  dtMs: number,
  dNorm: number,
  toNorm: (value: number) => number,
  fromNorm: (norm: number) => number
): AutomationPoint[] {
  const chosen = new Set(selection);
  let lo = Number.NEGATIVE_INFINITY;
  let hi = Number.POSITIVE_INFINITY;
  base.forEach((p, i) => {
    if (!chosen.has(i)) return;
    if (i === 0) lo = Math.max(lo, -p.timeMs);
    else if (!chosen.has(i - 1)) lo = Math.max(lo, base[i - 1].timeMs - p.timeMs);
    if (i < base.length - 1 && !chosen.has(i + 1)) hi = Math.min(hi, base[i + 1].timeMs - p.timeMs);
  });
  const dt = Math.round(Math.min(hi, Math.max(lo, dtMs)));
  return base.map((p, i) =>
    chosen.has(i)
      ? { ...p, timeMs: p.timeMs + dt, value: fromNorm(Math.min(1, Math.max(0, toNorm(p.value) + dNorm))) }
      : p
  );
}

const NO_POINTS: AutomationPoint[] = [];

export const AutomationLaneView: React.FC<AutomationLaneViewProps> = memo(
  ({
    track,
    lane,
    target: targetProp,
    widthPx,
    variant = "lane",
    heightPx = AUTOMATION_LANE_HEIGHT_PX,
    colorRole = "primary",
    clips = []
  }) => {
    const theme = useTheme();
    const { t } = useTranslation();
    const msPerPx = useTimelineUIStore((s) => s.msPerPx);
    // Only the main lane's label follows the scroll. A sub-lane never re-renders for it.
    const scrollLeftPx = useTimelineUIStore((s) => (variant === "overlay" ? s.scrollLeftPx : 0));
    const viewportPx = useTimelineUIStore((s) => (variant === "overlay" ? s.lanesViewportWidthPx : 0));
    const storeApi = useTimelineStoreApi();
    const setTrackAutomation = useTimelineStore((s) => s.setTrackAutomation);
    const history = useTimelineHistoryBatch();
    const rootRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<Drag | null>(null);
    const [selection, setSelection] = useState<number[]>([]);
    /** The point a move drag holds, for the value tag. */
    const [grabbed, setGrabbed] = useState<number | null>(null);
    const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
    const dragging = grabbed !== null;
    const [hovered, setHovered] = useState<number | null>(null);
    const [menu, setMenu] = useState<{ x: number; y: number; index: number } | null>(null);
    const overlay = variant === "overlay";
    const keyPreset = useSettingsStore((s) => s.settings.timelineKeyboardPreset);

    const target = targetProp ?? lane?.target;
    const points = lane?.points ?? NO_POINTS;

    const spec: AutomationTargetSpec | null = useMemo(
      () => (target ? automationTargetSpec(track, target, t) : null),
      [track, target, t]
    );
    const editable = spec !== null && target !== undefined && !track.locked;
    const playing = automationModePlays(automationModeOf(track));
    const on = lane?.enabled !== false && spec !== null && playing;
    const innerPx = heightPx - INSET_PX * 2;

    const yOf = useCallback(
      (value: number) =>
        spec ? INSET_PX + (1 - automationValueToNorm(spec, value)) * innerPx : heightPx / 2,
      [spec, innerPx, heightPx]
    );
    const valueAtY = useCallback(
      (y: number) => (spec ? automationNormToValue(spec, 1 - (y - INSET_PX) / innerPx) : 0),
      [spec, innerPx]
    );

    /** The track's lane for this view's parameter, read fresh from the store. */
    const freshLane = useCallback((): AutomationLane | undefined => {
      const current = storeApi.getState().tracks.find((tr) => tr.id === track.id);
      return current && target ? findAutomationLane(current, target) : undefined;
    }, [storeApi, track.id, target]);

    const freshPoints = useCallback((): AutomationPoint[] => freshLane()?.points ?? [], [freshLane]);

    /** Write this parameter's points into the track, creating its lane when it has none. */
    const commit = useCallback(
      (next: AutomationPoint[]) => {
        if (!target) return;
        const current = storeApi.getState().tracks.find((tr) => tr.id === track.id);
        const lanes = current?.automation ?? [];
        const existing = freshLane();
        setTrackAutomation(
          track.id,
          existing
            ? lanes.map((l) => (l.id === existing.id ? { ...l, points: next } : l))
            : [...lanes, { ...createAutomationLane(target), points: next }]
        );
        history.mark();
      },
      [storeApi, setTrackAutomation, track.id, target, freshLane, history]
    );

    const localPoint = useCallback((e: React.PointerEvent | React.MouseEvent) => {
      const rect = rootRef.current?.getBoundingClientRect();
      return {
        x: e.clientX - (rect?.left ?? 0),
        y: e.clientY - (rect?.top ?? 0)
      };
    }, []);

    const hitIndex = useCallback(
      (x: number, y: number): number | null => {
        let best: number | null = null;
        let bestDist = HIT_PX;
        points.forEach((p, i) => {
          const d = Math.hypot(p.timeMs / msPerPx - x, yOf(p.value) - y);
          if (d <= bestDist) {
            best = i;
            bestDist = d;
          }
        });
        return best;
      },
      [points, msPerPx, yOf]
    );

    /** Whether (x, y) lies on the drawn curve. */
    const onCurve = useCallback(
      (x: number, y: number): boolean => {
        if (!spec) return false;
        return Math.abs(yOf(automationValueAt(points, x * msPerPx, spec.value)) - y) <= HIT_PX;
      },
      [spec, points, msPerPx, yOf]
    );

    const toNorm = useCallback((v: number) => (spec ? automationValueToNorm(spec, v) : 0), [spec]);
    const fromNorm = useCallback((n: number) => (spec ? automationNormToValue(spec, n) : 0), [spec]);

    /** Add a point at (x, y), creating the lane when it has none. Returns its index. */
    const addAt = useCallback(
      (x: number, y: number): number => {
        if (!spec) return 0;
        // A lane that does not exist yet starts at the control's own value.
        const base: AutomationPoint[] = freshLane() ? freshPoints() : [{ timeMs: 0, value: spec.value }];
        const added = addAutomationPoint(base, {
          timeMs: Math.round(Math.max(0, x * msPerPx)),
          value: valueAtY(y)
        });
        commit(added.points);
        return added.index;
      },
      [spec, freshLane, freshPoints, msPerPx, valueAtY, commit]
    );

    const beginMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>, grab: number, sel: number[], x: number, y: number) => {
        dragRef.current = {
          kind: "move",
          pointerId: e.pointerId,
          grab,
          startX: x,
          startY: y,
          base: freshPoints(),
          selection: sel
        };
        setSelection(sel);
        setGrabbed(grab);
      },
      [freshPoints]
    );

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        rootRef.current?.focus({ preventScroll: true });
        if (!editable || !spec) return;
        const { x, y } = localPoint(e);
        const index = hitIndex(x, y);
        if (index !== null) {
          if (e.shiftKey) {
            // Shift-click adds the point to the selection or takes it out.
            setSelection((sel) => (sel.includes(index) ? sel.filter((i) => i !== index) : [...sel, index]));
            return;
          }
          history.begin();
          beginMove(e, index, selection.includes(index) ? selection : [index], x, y);
        } else if (e.ctrlKey && e.shiftKey && onCurve(x, y)) {
          // Control-Shift-drag on a segment bends it: the easing of the
          // segment arriving at the next point follows the drag.
          const base = freshPoints();
          const next = base.findIndex((p) => p.timeMs > x * msPerPx);
          if (next < 1) return;
          history.begin();
          dragRef.current = { kind: "bend", pointerId: e.pointerId, index: next, startY: y, base };
        } else if (onCurve(x, y)) {
          // A click on the curve adds a point there and keeps dragging it.
          history.begin();
          const added = addAt(x, y);
          beginMove(e, added, [added], x, y);
        } else {
          // A drag on empty space draws a selection box. Shift adds to the selection.
          const initial = e.shiftKey ? selection : [];
          dragRef.current = { kind: "box", pointerId: e.pointerId, x0: x, y0: y, initial };
          setSelection(initial);
          setBox({ x0: x, y0: y, x1: x, y1: y });
        }
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      [editable, spec, localPoint, hitIndex, history, beginMove, selection, onCurve, freshPoints, msPerPx, addAt]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        const { x, y } = localPoint(e);
        if (!drag || drag.pointerId !== e.pointerId) {
          if (editable) {
            const index = hitIndex(x, y);
            setHovered((prev) => (prev === index ? prev : index));
          }
          return;
        }
        if (drag.kind === "move") {
          // Shift keeps the points' times.
          const dtMs = e.shiftKey ? 0 : (x - drag.startX) * msPerPx;
          const dNorm = -(y - drag.startY) / innerPx;
          commit(moveAutomationSelection(drag.base, drag.selection, dtMs, dNorm, toNorm, fromNorm));
        } else if (drag.kind === "box") {
          setBox({ x0: drag.x0, y0: drag.y0, x1: x, y1: y });
          const [left, right] = [Math.min(drag.x0, x), Math.max(drag.x0, x)];
          const [top, bottom] = [Math.min(drag.y0, y), Math.max(drag.y0, y)];
          const inside = points
            .map((p, i) => ({ px: p.timeMs / msPerPx, py: yOf(p.value), i }))
            .filter(({ px, py }) => px >= left && px <= right && py >= top && py <= bottom)
            .map(({ i }) => i);
          setSelection([...new Set([...drag.initial, ...inside])]);
        } else {
          const dy = y - drag.startY;
          const from = drag.base[drag.index - 1];
          const to = drag.base[drag.index];
          let easing = "linear";
          if (Math.abs(dy) >= BEND_SLOP_PX) {
            // A bow toward the end value reaches it early (ease out).
            const bowUp = dy < 0;
            const rising = to.value > from.value;
            easing = bowUp === rising ? "easeOut" : "easeIn";
          }
          commit(setAutomationPointEasing(drag.base, drag.index, easing));
        }
      },
      [localPoint, editable, hitIndex, msPerPx, innerPx, commit, toNorm, fromNorm, points, yOf]
    );

    const endDrag = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        dragRef.current = null;
        setGrabbed(null);
        setBox(null);
        if (drag.kind !== "box") history.end();
      },
      [history]
    );

    const removeIndices = useCallback(
      (indices: number[]) => {
        history.begin();
        commit(removeAutomationPoints(freshPoints(), indices));
        history.end();
        setSelection([]);
      },
      [history, commit, freshPoints]
    );

    const handleDoubleClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!editable) return;
        const { x, y } = localPoint(e);
        const index = hitIndex(x, y);
        if (index !== null) {
          removeIndices([index]);
        } else if (!onCurve(x, y)) {
          // A double-click on empty space adds a point there.
          history.begin();
          const added = addAt(x, y);
          history.end();
          setSelection([added]);
        }
      },
      [editable, localPoint, hitIndex, removeIndices, onCurve, history, addAt]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!editable || selection.length === 0) return;
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          e.stopPropagation();
          removeIndices(selection);
        }
      },
      [editable, selection, removeIndices]
    );

    const handleContextMenu = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!editable) return;
        const { x, y } = localPoint(e);
        const index = hitIndex(x, y);
        if (index === null) return;
        e.preventDefault();
        e.stopPropagation();
        if (!selection.includes(index)) setSelection([index]);
        setMenu({ x: e.clientX, y: e.clientY, index });
      },
      [editable, localPoint, hitIndex, selection]
    );

    const setEasing = useCallback(
      (easing: string) => {
        if (!menu) return;
        history.begin();
        commit(setAutomationPointEasing(freshPoints(), menu.index, easing));
        history.end();
        setMenu(null);
      },
      [menu, history, commit, freshPoints]
    );

    // Ramps and curves draw at 1.5px, stepped (hold) segments at 1px.
    const curve = useMemo(() => {
      const endPx = Math.max(widthPx, ...points.map((p) => p.timeMs / msPerPx));
      if (points.length === 0) {
        const y = spec ? yOf(spec.value) : heightPx / 2;
        return { line: `M0 ${y} H${endPx}`, steps: "" };
      }
      const opts = { maxStepMs: Math.max(1, msPerPx * 3) };
      const first = points[0];
      const last = points[points.length - 1];
      const line = [`M0 ${yOf(first.value)} L${first.timeMs / msPerPx} ${yOf(first.value)}`];
      const steps: string[] = [];
      for (let i = 1; i < points.length; i++) {
        const coords = automationBreakpoints([points[i - 1], points[i]], points[i - 1].timeMs, opts).map(
          (bp) => `${bp.timeMs / msPerPx} ${yOf(bp.value)}`
        );
        (points[i].easing === "hold" ? steps : line).push(`M${coords.join(" L")}`);
      }
      line.push(`M${last.timeMs / msPerPx} ${yOf(last.value)} L${endPx} ${yOf(last.value)}`);
      return { line: line.join(" "), steps: steps.join(" ") };
    }, [points, msPerPx, widthPx, spec, yOf, heightPx]);

    const color = on ? theme.vars.palette[colorRole].main : theme.vars.palette.text.disabled;
    const readoutIndex = grabbed;
    const readoutPoint = readoutIndex !== null ? points[readoutIndex] : undefined;

    // The main lane labels the curve at its left edge: at the first point, or
    // at the left edge of the view when that point is scrolled out.
    const label = useMemo(() => {
      if (!overlay || !spec) return null;
      if (readoutPoint) return { x: readoutPoint.timeMs / msPerPx, value: readoutPoint.value };
      // The first point when it is in view, else the left edge of the view.
      const firstX = points.length > 0 ? points[0].timeMs / msPerPx : 0;
      const inView = firstX >= scrollLeftPx && (viewportPx <= 0 || firstX <= scrollLeftPx + viewportPx);
      const x = inView ? firstX : scrollLeftPx;
      return { x, value: automationValueAt(points, x * msPerPx, spec.value) };
    }, [overlay, spec, readoutPoint, points, msPerPx, scrollLeftPx, viewportPx]);

    const easingOptions = [
      { value: "linear", label: t("i18n-cont-inspector-02.keyframes.easing.linear") },
      { value: "easeIn", label: t("i18n-cont-inspector-02.keyframes.easing.easeIn") },
      { value: "easeOut", label: t("i18n-cont-inspector-02.keyframes.easing.easeOut") },
      { value: "easeInOut", label: t("i18n-cont-inspector-02.keyframes.easing.easeInOut") },
      { value: "hold", label: t("i18n-cont-inspector-02.keyframes.easing.hold") }
    ];
    const menuEasing = menu ? (points[menu.index]?.easing ?? "linear") : undefined;

    const pointerHandlers = {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onPointerLeave: () => setHovered(null),
      onLostPointerCapture: endDrag,
      onDoubleClick: handleDoubleClick,
      onContextMenu: handleContextMenu
    };

    const hitRects = useMemo(() => {
      if (!overlay || !editable) return [];
      const rects = automationHitRects(clips, msPerPx, widthPx, heightPx);
      // A point is grabbed wherever it draws, over a clip's name bar too.
      for (const p of points) {
        rects.push({
          x: p.timeMs / msPerPx - HIT_PX,
          y: yOf(p.value) - HIT_PX,
          width: HIT_PX * 2,
          height: HIT_PX * 2
        });
      }
      return rects;
    }, [overlay, editable, clips, msPerPx, widthPx, heightPx, points, yOf]);

    const laneName = spec ? `${spec.group} ${spec.label}` : t("timelineAutomation.missingTarget");
    const testId = overlay ? `automation-curve-${track.id}` : `automation-lane-${lane?.id ?? track.id}`;

    return (
      <div
        ref={rootRef}
        css={overlay ? overlayStyles : laneStyles(theme, heightPx)}
        style={
          overlay ? undefined : { cursor: !editable ? "default" : hovered !== null ? "grab" : "crosshair" }
        }
        tabIndex={overlay ? -1 : 0}
        role="group"
        aria-label={t("timelineAutomation.laneLabel", { name: laneName })}
        data-testid={testId}
        data-playhead-passthrough
        onKeyDown={handleKeyDown}
        {...(overlay ? {} : pointerHandlers)}
      >
        <svg width="100%" height={heightPx} aria-hidden="true">
          {overlay &&
            clips.map((clip, i) => (
              <rect
                key={i}
                x={clip.startMs / msPerPx}
                y={CLIP_NAME_BAR_BOTTOM_PX}
                width={clip.durationMs / msPerPx}
                height={Math.max(0, heightPx - CLIP_NAME_BAR_BOTTOM_PX)}
                fill={theme.vars.palette.background.default}
                fillOpacity={CLIP_DIM_OPACITY}
              />
            ))}
          <rect
            width="100%"
            height={heightPx}
            fill={color}
            fillOpacity={on ? TINT_OPACITY : TINT_OPACITY / 2}
          />
          {overlay && (
            // A dark halo under the curve keeps it readable over a region's fill.
            <path
              d={`${curve.line} ${curve.steps}`}
              fill="none"
              stroke={theme.vars.palette.background.default}
              strokeOpacity={HALO_OPACITY}
              strokeWidth={HALO_PX}
              strokeLinejoin="round"
            />
          )}
          <path
            d={curve.line}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray={!overlay && points.length === 0 ? "4 4" : undefined}
          />
          {curve.steps && <path d={curve.steps} fill="none" stroke={color} strokeWidth={1} />}
        </svg>
        {overlay &&
          hitRects.map((rect, i) => (
            <div
              key={i}
              className="hit"
              style={{
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
                cursor: hovered !== null ? "grab" : "crosshair"
              }}
              data-testid={i === 0 ? `automation-hit-${track.id}` : undefined}
              data-playhead-passthrough
              {...pointerHandlers}
            />
          ))}
        {selection.map((i) =>
          points[i] ? (
            <div
              key={`bar-${i}`}
              css={selectedBarStyles(color)}
              style={{ left: points[i].timeMs / msPerPx }}
              data-testid={`automation-selected-bar-${lane?.id ?? track.id}`}
            />
          ) : null
        )}
        {box && (
          <div
            css={boxStyles(theme)}
            data-testid={`automation-box-${lane?.id ?? track.id}`}
            style={{
              left: Math.min(box.x0, box.x1),
              top: Math.min(box.y0, box.y1),
              width: Math.abs(box.x1 - box.x0),
              height: Math.abs(box.y1 - box.y0)
            }}
          />
        )}
        {points.map((p, i) => (
          <div
            key={i}
            css={pointStyles(theme, color)}
            className={[
              selection.includes(i) ? "is-selected" : "",
              i === hovered && !dragging ? "is-hover" : "",
              on ? "" : "is-off"
            ].join(" ")}
            style={{ left: p.timeMs / msPerPx, top: yOf(p.value) }}
            data-testid={`automation-point-${lane?.id ?? track.id}`}
            data-playhead-passthrough
            title={spec ? spec.format(p.value) : undefined}
          />
        ))}
        {label && spec && (
          <div
            css={readoutStyles(theme)}
            data-testid={`automation-label-${track.id}`}
            style={{
              left: label.x + POINT_PX,
              top: Math.min(heightPx - 18, Math.max(0, yOf(label.value) - 20))
            }}
          >
            {spec.format(label.value)}
          </div>
        )}
        {!overlay && readoutPoint && spec && (
          <div
            css={readoutStyles(theme)}
            style={{
              left: readoutPoint.timeMs / msPerPx + POINT_PX,
              top: Math.min(heightPx - 18, Math.max(0, yOf(readoutPoint.value) - 9))
            }}
          >
            {spec.format(readoutPoint.value)}
          </div>
        )}
        <ContextMenu
          open={menu !== null}
          position={menu ? { x: menu.x, y: menu.y } : null}
          onClose={() => setMenu(null)}
        >
          {easingOptions.map((option) => (
            <MenuItemPrimitive
              key={option.value}
              label={option.label}
              checkable="radio"
              checked={menuEasing === option.value}
              onClick={() => setEasing(option.value)}
            />
          ))}
          <MenuItemPrimitive
            label={t("timelineAutomation.deletePoint")}
            shortcut={formatActionShortcut(keyPreset, "deleteSelected") ?? undefined}
            color="error"
            dividerBefore
            onClick={() => {
              if (menu) removeIndices(selection.includes(menu.index) ? selection : [menu.index]);
              setMenu(null);
            }}
          />
        </ContextMenu>
      </div>
    );
  }
);

AutomationLaneView.displayName = "AutomationLaneView";
