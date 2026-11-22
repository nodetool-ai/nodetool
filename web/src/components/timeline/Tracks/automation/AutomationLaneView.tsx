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
import { useTimelineHistoryBatch } from "../../../../stores/timeline/useTimelineHistoryBatch";
import {
  BORDER_RADIUS,
  ContextMenu,
  FONT_SIZE_MONO,
  MenuItemPrimitive,
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
const POINT_PX = 7;
/** The curve is dimmed over clips by this share, toward the lane background. */
const CLIP_DIM_OPACITY = 0.4;
const TINT_OPACITY = 0.12;

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
    "&.is-selected": {
      background: theme.vars.palette.common.white,
      boxShadow: `0 0 0 2px ${color}`
    },
    "&.is-off": { background: theme.vars.palette.text.disabled }
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

interface Drag {
  pointerId: number;
  index: number;
  startTimeMs: number;
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
    const [selected, setSelected] = useState<number | null>(null);
    const [dragging, setDragging] = useState(false);
    const [menu, setMenu] = useState<{ x: number; y: number; index: number } | null>(null);
    const overlay = variant === "overlay";

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

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        rootRef.current?.focus({ preventScroll: true });
        if (!editable || !spec) return;
        const { x, y } = localPoint(e);
        let index = hitIndex(x, y);
        history.begin();
        if (index === null) {
          // A lane that does not exist yet starts at the control's own value.
          const base: AutomationPoint[] = freshLane() ? freshPoints() : [{ timeMs: 0, value: spec.value }];
          const added = addAutomationPoint(base, {
            timeMs: Math.round(Math.max(0, x * msPerPx)),
            value: valueAtY(y)
          });
          commit(added.points);
          index = added.index;
        }
        const point = freshPoints()[index];
        dragRef.current = { pointerId: e.pointerId, index, startTimeMs: point?.timeMs ?? 0 };
        setSelected(index);
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      [editable, spec, localPoint, hitIndex, history, freshLane, freshPoints, msPerPx, valueAtY, commit]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const { x, y } = localPoint(e);
        const timeMs = e.shiftKey ? drag.startTimeMs : Math.round(Math.max(0, x * msPerPx));
        commit(moveAutomationPoint(freshPoints(), drag.index, timeMs, valueAtY(y)));
      },
      [localPoint, msPerPx, commit, freshPoints, valueAtY]
    );

    const endDrag = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        dragRef.current = null;
        setDragging(false);
        history.end();
      },
      [history]
    );

    const removeAt = useCallback(
      (index: number) => {
        history.begin();
        commit(removeAutomationPoints(freshPoints(), [index]));
        history.end();
        setSelected(null);
      },
      [history, commit, freshPoints]
    );

    const handleDoubleClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!editable) return;
        const { x, y } = localPoint(e);
        const index = hitIndex(x, y);
        if (index !== null) removeAt(index);
      },
      [editable, localPoint, hitIndex, removeAt]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!editable || selected === null) return;
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          e.stopPropagation();
          removeAt(selected);
        }
      },
      [editable, selected, removeAt]
    );

    const handleContextMenu = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!editable) return;
        const { x, y } = localPoint(e);
        const index = hitIndex(x, y);
        if (index === null) return;
        e.preventDefault();
        e.stopPropagation();
        setSelected(index);
        setMenu({ x: e.clientX, y: e.clientY, index });
      },
      [editable, localPoint, hitIndex]
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

    const curve = useMemo(() => {
      const endPx = Math.max(widthPx, ...points.map((p) => p.timeMs / msPerPx));
      if (points.length === 0) {
        const y = spec ? yOf(spec.value) : heightPx / 2;
        return { line: `M0 ${y} H${endPx}` };
      }
      const breakpoints = automationBreakpoints(points, 0, {
        maxStepMs: Math.max(1, msPerPx * 3)
      });
      const coords = breakpoints.map((bp) => `${bp.timeMs / msPerPx} ${yOf(bp.value)}`);
      const lastY = yOf(breakpoints[breakpoints.length - 1].value);
      return { line: `M${coords.join(" L")} L${endPx} ${lastY}` };
    }, [points, msPerPx, widthPx, spec, yOf, heightPx]);

    const color = on ? theme.vars.palette[colorRole].main : theme.vars.palette.text.disabled;
    const readoutIndex = dragging ? selected : null;
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
        style={overlay ? undefined : { cursor: editable ? "crosshair" : "default" }}
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
          <path
            d={curve.line}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray={!overlay && points.length === 0 ? "4 4" : undefined}
          />
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
                cursor: "crosshair"
              }}
              data-testid={i === 0 ? `automation-hit-${track.id}` : undefined}
              data-playhead-passthrough
              {...pointerHandlers}
            />
          ))}
        {points.map((p, i) => (
          <div
            key={i}
            css={pointStyles(theme, color)}
            className={[i === selected ? "is-selected" : "", on ? "" : "is-off"].join(" ")}
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
            color="error"
            dividerBefore
            onClick={() => {
              if (menu) removeAt(menu.index);
              setMenu(null);
            }}
          />
        </ContextMenu>
      </div>
    );
  }
);

AutomationLaneView.displayName = "AutomationLaneView";
