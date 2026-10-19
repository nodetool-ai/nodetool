/** @jsxImportSource @emotion/react */
/**
 * The DAW-mode body of the timeline editor: the transport strip on top (the
 * preview mounted audio-only, so playback keeps its audio graph and clock),
 * the tracks taking every pixel the preview gave up, and the resizable bottom
 * dock. Shared by `TimelineEditor` and the DAW lab page, so it needs no
 * routing or server state of its own.
 *
 * While it is mounted the ruler reads in bars, so snapping follows the beat
 * grid; leaving DAW mode puts the ruler back the way it was.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStoreApi } from "../../../../stores/timeline/TimelineUIStore";
import {
  DEFAULT_DAW_DOCK_HEIGHT_PX,
  MAX_DAW_DOCK_HEIGHT_PX,
  MIN_DAW_DOCK_HEIGHT_PX,
  useTimelineLayoutStore
} from "../../../../stores/timeline/TimelineLayoutStore";
import { useTimelineIsMobile } from "../../../../hooks/timeline/useTimelineIsMobile";
import { FlexColumn, ResizeHandle, SPACING } from "../../../ui_primitives";
import { PreviewArea } from "../../preview/PreviewArea";
import { TracksRegion } from "../../Tracks/TracksRegion";
import { DawDock } from "./DawDock";

/** The tracks never shrink below this while the dock grows. */
const MIN_TRACKS_HEIGHT_PX = 120;
/** Height the tracks get before the first layout measurement. */
const FALLBACK_TRACKS_HEIGHT_PX = 240;
const KEYBOARD_RESIZE_STEP_PX = 20;
/** Phone default: the dock takes a little under half the workspace. */
const MOBILE_DOCK_FRACTION = 0.45;

export interface DawWorkspaceProps {
  onGenerate?: () => void;
}

export const DawWorkspace: React.FC<DawWorkspaceProps> = memo(({ onGenerate }) => {
  const { t } = useTranslation();
  const isMobile = useTimelineIsMobile();
  const fps = useTimelineStore((s) => s.fps);
  const dockHeight = useTimelineLayoutStore((s) => s.dawDockHeightPx);
  const setDockHeight = useTimelineLayoutStore((s) => s.setDawDockHeightPx);
  const uiApi = useTimelineUIStoreApi();

  // Bars ruler while in DAW mode: snapping then offers the beat grid.
  useEffect(() => {
    const ui = uiApi.getState();
    const previous = ui.rulerMode;
    ui.setRulerMode("bars");
    return () => uiApi.getState().setRulerMode(previous);
  }, [uiApi]);

  // The column and the tracks slot are measured: TracksRegion takes a height
  // in px, and the dock may never push the tracks under their minimum.
  const columnRef = useRef<HTMLDivElement>(null);
  const tracksSlotRef = useRef<HTMLDivElement>(null);
  const [tracksHeight, setTracksHeight] = useState(FALLBACK_TRACKS_HEIGHT_PX);
  const [maxDockHeight, setMaxDockHeight] = useState(MAX_DAW_DOCK_HEIGHT_PX);
  const [columnHeight, setColumnHeight] = useState(() =>
    typeof window === "undefined" ? 800 : window.innerHeight
  );
  useEffect(() => {
    const column = columnRef.current;
    const slot = tracksSlotRef.current;
    if (!column || !slot) return;
    const update = () => {
      if (slot.clientHeight > 0) setTracksHeight(slot.clientHeight);
      if (column.clientHeight <= 0) return;
      setColumnHeight(column.clientHeight);
      // Everything in the column that is not the tracks or the dock.
      const chrome = column.clientHeight - slot.clientHeight - (column.lastElementChild?.clientHeight ?? 0);
      const available = column.clientHeight - Math.max(0, chrome) - MIN_TRACKS_HEIGHT_PX;
      setMaxDockHeight(
        Math.max(MIN_DAW_DOCK_HEIGHT_PX, Math.min(MAX_DAW_DOCK_HEIGHT_PX, available))
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(column);
    observer.observe(slot);
    return () => observer.disconnect();
  }, []);

  // A phone that never picked a height starts at a share of the workspace,
  // so the tracks keep the rest whatever the editor chrome above takes.
  const mobileDefault = Math.round(
    Math.max(MIN_DAW_DOCK_HEIGHT_PX, columnHeight * MOBILE_DOCK_FRACTION)
  );
  const chosenHeight =
    isMobile && dockHeight === DEFAULT_DAW_DOCK_HEIGHT_PX ? mobileDefault : dockHeight;
  const effectiveDockHeight = Math.min(chosenHeight, maxDockHeight);

  // A drag records the latest height and commits once per animation frame,
  // the way the tracks divider does; the store write persists it.
  const pendingRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const latestRef = useRef(effectiveDockHeight);
  latestRef.current = effectiveDockHeight;
  const handleResize = useCallback(
    (delta: number) => {
      const next = Math.min(maxDockHeight, (pendingRef.current ?? latestRef.current) + delta);
      if (!draggingRef.current) {
        setDockHeight(next);
        return;
      }
      pendingRef.current = next;
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          if (pendingRef.current !== null) setDockHeight(pendingRef.current);
        });
      }
    },
    [maxDockHeight, setDockHeight]
  );
  const handleResizeStart = useCallback(() => {
    draggingRef.current = true;
    pendingRef.current = null;
  }, []);
  const handleResizeEnd = useCallback(() => {
    draggingRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (pendingRef.current !== null) setDockHeight(pendingRef.current);
    pendingRef.current = null;
  }, [setDockHeight]);
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );
  const resetDockHeight = useCallback(
    () => setDockHeight(DEFAULT_DAW_DOCK_HEIGHT_PX),
    [setDockHeight]
  );

  return (
    <FlexColumn
      ref={columnRef}
      fullWidth
      sx={{ flex: "1 1 0", minHeight: 0, minWidth: 0, overflow: "hidden" }}
      data-testid="daw-workspace"
    >
      <PreviewArea audioOnly fps={fps} />
      <FlexColumn
        ref={tracksSlotRef}
        fullWidth
        sx={{ flex: "1 1 0", minHeight: 0, overflow: "hidden" }}
      >
        <TracksRegion heightPx={tracksHeight} onGenerate={onGenerate} />
      </FlexColumn>
      <ResizeHandle
        orientation="horizontal"
        invert
        value={effectiveDockHeight}
        min={MIN_DAW_DOCK_HEIGHT_PX}
        max={maxDockHeight}
        thickness={isMobile ? SPACING.xxl : SPACING.sm}
        grip={isMobile}
        keyboardStep={KEYBOARD_RESIZE_STEP_PX}
        ariaLabel={t("i18n-next119.daw.resizeDock")}
        onResize={handleResize}
        onResizeStart={handleResizeStart}
        onResizeEnd={handleResizeEnd}
        onDoubleClick={resetDockHeight}
      />
      <DawDock heightPx={effectiveDockHeight} />
    </FlexColumn>
  );
});

DawWorkspace.displayName = "DawWorkspace";
