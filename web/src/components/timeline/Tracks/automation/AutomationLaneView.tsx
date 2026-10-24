/** @jsxImportSource @emotion/react */
/**
 * AutomationLaneView — one automation lane under its track: the curve over
 * document time and its points.
 *
 * Click the lane to add a point there and keep dragging to place it. Drag a
 * point to move it (Shift keeps its time), double-click or press Delete to
 * remove it, and right-click it for the easing of the segment arriving at it.
 * Every gesture is one undo step.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import {
  addAutomationPoint,
  automationBreakpoints,
  moveAutomationPoint,
  removeAutomationPoints,
  setAutomationPointEasing,
  type AutomationLane,
  type AutomationPoint,
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
import { AUTOMATION_LANE_HEIGHT_PX } from "./automationLayout";
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
const POINT_PX = 9;

const laneStyles = (theme: Theme) =>
  css({
    position: "relative",
    width: "100%",
    height: AUTOMATION_LANE_HEIGHT_PX,
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

const pointStyles = (theme: Theme) =>
  css({
    position: "absolute",
    width: POINT_PX,
    height: POINT_PX,
    marginLeft: -POINT_PX / 2,
    marginTop: -POINT_PX / 2,
    borderRadius: BORDER_RADIUS.circle,
    border: `1px solid ${theme.vars.palette.background.default}`,
    background: theme.vars.palette.primary.main,
    zIndex: Z_INDEX.base + 1,
    "&.is-selected": {
      background: theme.vars.palette.common.white,
      boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}`
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
  lane: AutomationLane;
  /** Width of the lanes' content, so the curve runs to the end of it. */
  widthPx: number;
}

interface Drag {
  pointerId: number;
  index: number;
  startTimeMs: number;
}

export const AutomationLaneView: React.FC<AutomationLaneViewProps> = memo(
  ({ track, lane, widthPx }) => {
    const theme = useTheme();
    const { t } = useTranslation();
    const msPerPx = useTimelineUIStore((s) => s.msPerPx);
    const storeApi = useTimelineStoreApi();
    const setTrackAutomation = useTimelineStore((s) => s.setTrackAutomation);
    const history = useTimelineHistoryBatch();
    const rootRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<Drag | null>(null);
    const [selected, setSelected] = useState<number | null>(null);
    const [dragging, setDragging] = useState(false);
    const [menu, setMenu] = useState<{ x: number; y: number; index: number } | null>(null);

    const spec: AutomationTargetSpec | null = useMemo(
      () => automationTargetSpec(track, lane.target, t),
      [track, lane.target, t]
    );
    const editable = spec !== null && !track.locked;
    const on = lane.enabled !== false && spec !== null;
    const innerPx = AUTOMATION_LANE_HEIGHT_PX - INSET_PX * 2;

    const yOf = useCallback(
      (value: number) =>
        spec ? INSET_PX + (1 - automationValueToNorm(spec, value)) * innerPx : AUTOMATION_LANE_HEIGHT_PX / 2,
      [spec, innerPx]
    );
    const valueAtY = useCallback(
      (y: number) => (spec ? automationNormToValue(spec, 1 - (y - INSET_PX) / innerPx) : 0),
      [spec, innerPx]
    );

    /** Write this lane's points into the track, reading the track fresh. */
    const commit = useCallback(
      (points: AutomationPoint[]) => {
        const current = storeApi.getState().tracks.find((tr) => tr.id === track.id);
        const lanes = current?.automation ?? [];
        setTrackAutomation(
          track.id,
          lanes.map((l) => (l.id === lane.id ? { ...l, points } : l))
        );
        history.mark();
      },
      [storeApi, setTrackAutomation, track.id, lane.id, history]
    );

    const freshPoints = useCallback((): AutomationPoint[] => {
      const current = storeApi.getState().tracks.find((tr) => tr.id === track.id);
      return current?.automation?.find((l) => l.id === lane.id)?.points ?? [];
    }, [storeApi, track.id, lane.id]);

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
        lane.points.forEach((p, i) => {
          const d = Math.hypot(p.timeMs / msPerPx - x, yOf(p.value) - y);
          if (d <= bestDist) {
            best = i;
            bestDist = d;
          }
        });
        return best;
      },
      [lane.points, msPerPx, yOf]
    );

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        rootRef.current?.focus({ preventScroll: true });
        if (!editable) return;
        const { x, y } = localPoint(e);
        let index = hitIndex(x, y);
        history.begin();
        if (index === null) {
          const added = addAutomationPoint(freshPoints(), {
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
      [editable, localPoint, hitIndex, history, freshPoints, msPerPx, valueAtY, commit]
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
      const endPx = Math.max(widthPx, ...lane.points.map((p) => p.timeMs / msPerPx));
      if (lane.points.length === 0) {
        const y = spec ? yOf(spec.value) : AUTOMATION_LANE_HEIGHT_PX / 2;
        return { line: `M0 ${y} H${endPx}`, area: "" };
      }
      const breakpoints = automationBreakpoints(lane.points, 0, {
        maxStepMs: Math.max(1, msPerPx * 3)
      });
      const coords = breakpoints.map((bp) => `${bp.timeMs / msPerPx} ${yOf(bp.value)}`);
      const lastY = yOf(breakpoints[breakpoints.length - 1].value);
      const line = `M${coords.join(" L")} L${endPx} ${lastY}`;
      const area = `${line} L${endPx} ${AUTOMATION_LANE_HEIGHT_PX} L0 ${AUTOMATION_LANE_HEIGHT_PX} Z`;
      return { line, area };
    }, [lane.points, msPerPx, widthPx, spec, yOf]);

    const stroke = on ? theme.vars.palette.primary.main : theme.vars.palette.text.disabled;
    const readoutIndex = dragging ? selected : null;
    const readoutPoint = readoutIndex !== null ? lane.points[readoutIndex] : undefined;

    const easingOptions = [
      { value: "linear", label: t("i18n-cont-inspector-02.keyframes.easing.linear") },
      { value: "easeIn", label: t("i18n-cont-inspector-02.keyframes.easing.easeIn") },
      { value: "easeOut", label: t("i18n-cont-inspector-02.keyframes.easing.easeOut") },
      { value: "easeInOut", label: t("i18n-cont-inspector-02.keyframes.easing.easeInOut") },
      { value: "hold", label: t("i18n-cont-inspector-02.keyframes.easing.hold") }
    ];
    const menuEasing = menu ? (lane.points[menu.index]?.easing ?? "linear") : undefined;

    return (
      <div
        ref={rootRef}
        css={laneStyles(theme)}
        style={{ cursor: editable ? "crosshair" : "default" }}
        tabIndex={0}
        role="group"
        aria-label={t("timelineAutomation.laneLabel", {
          name: spec ? `${spec.group} ${spec.label}` : t("timelineAutomation.missingTarget")
        })}
        data-testid={`automation-lane-${lane.id}`}
        data-playhead-passthrough
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
      >
        <svg width="100%" height={AUTOMATION_LANE_HEIGHT_PX} aria-hidden="true">
          {curve.area && (
            <path d={curve.area} fill={stroke} fillOpacity={on ? 0.12 : 0.06} stroke="none" />
          )}
          <path
            d={curve.line}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeDasharray={lane.points.length === 0 ? "4 4" : undefined}
          />
        </svg>
        {lane.points.map((p, i) => (
          <div
            key={i}
            css={pointStyles(theme)}
            className={[i === selected ? "is-selected" : "", on ? "" : "is-off"].join(" ")}
            style={{ left: p.timeMs / msPerPx, top: yOf(p.value) }}
            data-testid={`automation-point-${lane.id}`}
            data-playhead-passthrough
            title={spec ? spec.format(p.value) : undefined}
          />
        ))}
        {readoutPoint && spec && (
          <div
            css={readoutStyles(theme)}
            style={{
              left: readoutPoint.timeMs / msPerPx + POINT_PX,
              top: Math.min(AUTOMATION_LANE_HEIGHT_PX - 18, Math.max(0, yOf(readoutPoint.value) - 9))
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
