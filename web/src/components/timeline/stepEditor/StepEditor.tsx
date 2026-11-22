/** @jsxImportSource @emotion/react */
/**
 * StepEditor: the second view of the clip editor. It shows the notes or the
 * controller events of one midi clip as beams on a time grid, one row per
 * lane, so velocities and controller values are drawn rather than dragged.
 *
 * It edits the same clip as the piano roll through the same store paths. Each
 * pointer gesture is one undo entry (`useTimelineHistoryBatch`), and every menu
 * action that writes is one entry too. All settings are in-memory UI state.
 */

import React, {
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useColorScheme, useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  MIDI_MAX_CONTROLLER_LANES_PER_CLIP,
  beatDurationMs,
  divisionToTicks,
  lineSteps,
  msToTicks,
  resolveTempo,
  scaleValues,
  setLanePoints,
  stepStartTick,
  ticksToMs,
  valueFromY
} from "@nodetool-ai/timeline";
import type { MidiControllerLane, MidiControllerTarget } from "@nodetool-ai/timeline";

import {
  timelineTemporalOf,
  useTimelineStore,
  useTimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import {
  DEFAULT_STEP_LANE_PARAMS,
  useTimelineUIStore,
  type StepEditorTool,
  type StepLaneParams
} from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStoreApi } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";
import { findClipById } from "../../../stores/timeline/clipLookup";
import {
  Caption,
  ConfirmDialog,
  FlexColumn,
  FlexRow,
  SPACING,
  StatusDot,
  Text
} from "../../ui_primitives";
import { playAuditionNote } from "../preview/audition";
import { partitionTimelineWheel } from "../Tracks/timelineWheel";
import { visibleTempoGrid } from "../Tracks/tempoGrid";
import type { MenuRow } from "../pianoRoll/PianoRollMenus";
import { PianoRollRuler, PIANO_ROLL_RULER_HEIGHT_PX } from "../pianoRoll/PianoRollRuler";
import { PianoRollRegionStrip, REGION_STRIP_HEIGHT_PX } from "../pianoRoll/PianoRollRegionStrip";
import {
  isMacPlatform,
  positionText,
  resolveTool,
  stepLineTicks
} from "../pianoRoll/pianoRollTools";
import {
  tickToX,
  xToTick,
  type PianoRollGeometry
} from "../pianoRoll/pianoRollGeometry";
import { StepEditorToolbar } from "./StepEditorToolbar";
import { StepEditorInspector } from "./StepEditorInspector";
import { NumberDialog } from "./StepEditorDialogs";
import { beamColors, pickStepEditorColors } from "./stepEditorColors";
import {
  buildStepLanes,
  controllerLaneView,
  docChanged,
  drawIntoLane,
  eventsInRect,
  hitBeam,
  laneEvents,
  beamBox,
  mapEventValues,
  noteLaneKey,
  removeEvents,
  shiftEventValues,
  thinOutEvents,
  VELOCITY_MIN,
  type StepDoc,
  type StepLaneView
} from "./stepEditorModel";

/** Row height at the default vertical zoom. */
const ROW_HEIGHT_PX = 64;
const MIN_V_ZOOM = 0.5;
const MAX_V_ZOOM = 2;
const MIN_PX_PER_TICK = 0.002;
const MAX_PX_PER_TICK = 1;
const ZOOM_STEP = 1.15;
const CATCH_PLAYHEAD_FRACTION = 0.05;
/** Width of the lane-name column. */
const LANE_NAME_WIDTH_PX = 132;
/** Grid lines closer together than this are not drawn. */
const MIN_LINE_GAP_PX = 4;
/** How far a pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 3;
/** The most steps one pointer move fills, so a huge jump stays cheap. */
const MAX_STEPS_PER_MOVE = 4096;

const rootStyles = (theme: Theme) =>
  css({
    width: "100%",
    minHeight: 0,
    backgroundColor: theme.vars.palette.background.default,
    outline: "none",
    "&:focus-visible": {
      boxShadow: `inset 0 0 0 2px ${theme.vars.palette.primary.main}`
    }
  });

const eventsWrapStyles = css({
  position: "relative",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  touchAction: "none"
});

const playheadStyles = (theme: Theme) =>
  css({
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    pointerEvents: "none",
    backgroundColor: theme.vars.palette.primary.main
  });

const isNoteControl = (target: EventTarget) =>
  target instanceof HTMLElement &&
  target.closest(
    "input, select, textarea, button, [role=combobox], [role=listbox], [role=option], [role=dialog], [contenteditable=true]"
  ) !== null;

type Gesture =
  | {
      kind: "pencil";
      lane: StepLaneView;
      step: number;
      length: number;
      doc: StepDoc;
      lastStart: number | null;
      lastValue: number;
    }
  | { kind: "line"; lane: StepLaneView; step: number; length: number; t0: number; v0: number }
  | { kind: "erase"; lane: StepLaneView; params: StepLaneParams; lastX: number; lastY: number }
  | {
      kind: "drag";
      lane: StepLaneView;
      ids: ReadonlySet<string>;
      baseline: StepDoc;
      last: StepDoc;
      startY: number;
      begun: boolean;
    }
  | {
      kind: "marquee";
      lane: StepLaneView;
      laneIndex: number;
      additive: boolean;
      baseIds: ReadonlySet<string>;
      startX: number;
      startY: number;
      moved: boolean;
    };

interface Overlay {
  line?: { laneIndex: number; x0: number; y0: number; x1: number; y1: number };
  marquee?: { laneIndex: number; left: number; right: number; top: number; bottom: number };
}

interface StepEditorProps {
  clipId: string;
  /** Closes the panel: Escape with nothing selected. */
  onClose: () => void;
  toolbarStart?: ReactNode;
  /** Phone layout: the lane inspector starts hidden. */
  compact?: boolean;
  toolbarEnd?: ReactNode;
}

type DialogKind = "otherCc" | "newNote" | "scale" | "setValue" | null;

export const StepEditor: React.FC<StepEditorProps> = memo(
  ({ clipId, onClose, toolbarStart, toolbarEnd, compact = false }) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const { mode, systemMode } = useColorScheme();
    const activeMode = (mode === "system" ? systemMode : mode) ?? "dark";
    const clip = useTimelineStore((s) => findClipById(s.clips, clipId));
    const tempo = useTimelineStore((s) => resolveTempo(s));
    const setClipNotes = useTimelineStore((s) => s.setClipNotes);
    const setClipControllers = useTimelineStore((s) => s.setClipControllers);
    const trackId = clip?.trackId;
    const instrument = useTimelineStore(
      (s) => s.tracks.find((tr) => tr.id === trackId)?.instrument
    );
    const settings = useTimelineUIStore((s) => s.stepEditorSettings);
    const setSettings = useTimelineUIStore((s) => s.setStepEditorSettings);
    const setLaneParams = useTimelineUIStore((s) => s.setStepLaneParams);
    const rollSettings = useTimelineUIStore((s) => s.pianoRollSettings);
    const setRollSettings = useTimelineUIStore((s) => s.setPianoRollSettings);
    const settingsRef = useRef(settings);
    settingsRef.current = settings;
    const rollSettingsRef = useRef(rollSettings);
    rollSettingsRef.current = rollSettings;
    const mac = useMemo(() => isMacPlatform(), []);
    const docApi = useTimelineStoreApi();
    const playbackApi = useTimelinePlaybackStoreApi();
    const history = useTimelineHistoryBatch();

    const notes = useMemo(() => clip?.notes ?? [], [clip?.notes]);
    const controllers = useMemo(() => clip?.controllers ?? [], [clip?.controllers]);
    const doc = useMemo<StepDoc>(() => ({ notes, controllers }), [notes, controllers]);

    // Lanes that exist only in the editor until they hold an event.
    const [pendingTargets, setPendingTargets] = useState<MidiControllerTarget[]>([]);
    const [extraPitches, setExtraPitches] = useState<number[]>([]);
    const [hidden, setHidden] = useState<ReadonlyMap<number, ReadonlySet<string>>>(
      () => new Map()
    );
    const [selectedLaneKey, setSelectedLaneKey] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
    const selectedIdsRef = useRef(selectedIds);
    selectedIdsRef.current = selectedIds;
    const [dialog, setDialog] = useState<DialogKind>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const lanes = useMemo(
      () =>
        buildStepLanes({
          laneSet: settings.laneSet,
          notes,
          controllers,
          pendingTargets,
          extraPitches,
          hidden
        }),
      [settings.laneSet, notes, controllers, pendingTargets, extraPitches, hidden]
    );
    const lanesRef = useRef(lanes);
    lanesRef.current = lanes;
    const selectedLane = lanes.find((l) => l.key === selectedLaneKey) ?? lanes[0] ?? null;
    const paramsOf = useCallback(
      (lane: StepLaneView | null): StepLaneParams =>
        (lane ? settingsRef.current.laneParams[lane.key] : undefined) ?? DEFAULT_STEP_LANE_PARAMS,
      []
    );
    const selectedParams =
      (selectedLane ? settings.laneParams[selectedLane.key] : undefined) ??
      DEFAULT_STEP_LANE_PARAMS;
    const gridStepTicks = divisionToTicks(selectedParams.grid);

    const eventsByLane = useMemo(
      () => lanes.map((lane) => laneEvents(lane, doc)),
      [lanes, doc]
    );

    const laneName = useCallback(
      (lane: StepLaneView): string => {
        if (lane.label !== undefined) return lane.label;
        const key = lane.nameKey ?? "cc";
        return t(`pass3_20.stepEditor.laneNames.${key}`, {
          n: lane.nameArg,
          note: lane.nameArg
        });
      },
      [t]
    );

    // ── Geometry ──────────────────────────────────────────────────────────
    const [size, setSize] = useState({ width: 0, height: 0 });
    const [pxPerTick, setPxPerTick] = useState(0.05);
    const [scrollTick, setScrollTick] = useState(0);
    const [scrollTop, setScrollTop] = useState(0);
    const [vZoom, setVZoom] = useState(1);
    const rowHeightPx = Math.round(ROW_HEIGHT_PX * vZoom);
    const geometry: PianoRollGeometry = useMemo(
      () => ({ pxPerTick, scrollTick, rowHeightPx, topPitch: 0 }),
      [pxPerTick, scrollTick, rowHeightPx]
    );
    const geometryRef = useRef(geometry);
    geometryRef.current = geometry;
    const scrollTopRef = useRef(scrollTop);
    scrollTopRef.current = scrollTop;
    const rowHeightRef = useRef(rowHeightPx);
    rowHeightRef.current = rowHeightPx;

    const [overlay, setOverlay] = useState<Overlay>({});
    const gestureRef = useRef<Gesture | null>(null);
    const eventsRef = useRef<HTMLDivElement | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const playheadRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const positionRef = useRef<HTMLSpanElement | null>(null);
    const hoveringRef = useRef(false);
    const [cursor, setCursor] = useState("default");

    const inPointMs = clip?.inPointMs ?? 0;
    const clipStartMs = clip?.startMs ?? 0;
    const durationMs = clip?.durationMs ?? 0;
    const bpm = tempo.bpm;
    const windowFromTick = useMemo(() => msToTicks(inPointMs, bpm), [inPointMs, bpm]);
    const windowToTick = useMemo(
      () => msToTicks(inPointMs + durationMs, bpm),
      [inPointMs, durationMs, bpm]
    );
    const tickToTimelineMs = useCallback(
      (tick: number) => clipStartMs + ticksToMs(tick, bpm) - inPointMs,
      [clipStartMs, inPointMs, bpm]
    );
    const timelineMsToTick = useCallback(
      (ms: number) => msToTicks(ms - clipStartMs + inPointMs, bpm),
      [clipStartMs, inPointMs, bpm]
    );
    const beatTicks = useMemo(() => msToTicks(beatDurationMs(tempo), tempo.bpm), [tempo]);
    const gridPhaseTick = useMemo(
      () => timelineMsToTick(tempo.offsetMs),
      [timelineMsToTick, tempo.offsetMs]
    );

    useEffect(() => {
      const el = eventsRef.current;
      if (!el) return;
      const measure = () => {
        const rect = el.getBoundingClientRect();
        setSize((prev) =>
          prev.width === rect.width && prev.height === rect.height
            ? prev
            : { width: rect.width, height: rect.height }
        );
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    // Frame the clip's window once per clip, so the user's own zoom survives.
    const framedClipIdRef = useRef<string | null>(null);
    useEffect(() => {
      if (size.width <= 0 || size.height <= 0) return;
      if (framedClipIdRef.current === clipId) return;
      framedClipIdRef.current = clipId;
      const span = Math.max(1, windowToTick - windowFromTick);
      setPxPerTick(Math.min(MAX_PX_PER_TICK, Math.max(MIN_PX_PER_TICK, size.width / span)));
      setScrollTick(windowFromTick);
      setSelectedIds(new Set());
    }, [clipId, size.width, size.height, windowFromTick, windowToTick]);

    // Keep the vertical scroll inside the lane stack.
    const maxScrollTop = Math.max(0, lanes.length * rowHeightPx - size.height);
    useEffect(() => {
      if (scrollTop > maxScrollTop) setScrollTop(maxScrollTop);
    }, [scrollTop, maxScrollTop]);

    useEffect(() => {
      rootRef.current?.focus();
    }, [clipId]);

    // Playhead, written into the DOM so playback does not re-render the editor.
    useEffect(() => {
      const apply = (timeMs: number) => {
        const node = playheadRef.current;
        if (!node) return;
        const x = tickToX(timelineMsToTick(timeMs), geometryRef.current);
        node.style.transform = `translateX(${x}px)`;
        node.style.visibility = x >= 0 && x <= size.width ? "visible" : "hidden";
      };
      apply(playbackApi.getState().getTimeMs());
      return playbackApi.getState().subscribeTime(apply);
    }, [playbackApi, timelineMsToTick, size.width, geometry]);

    // Catch: keep the playhead on screen while the transport plays.
    useEffect(() => {
      if (!rollSettings.catchPlayhead) return;
      return playbackApi.getState().subscribeTime((ms) => {
        if (!playbackApi.getState().isPlaying) return;
        const tick = timelineMsToTick(ms);
        const geo = geometryRef.current;
        const last = xToTick(size.width, geo);
        if (tick >= geo.scrollTick && tick <= last) return;
        setScrollTick(Math.max(0, tick - (last - geo.scrollTick) * CATCH_PLAYHEAD_FRACTION));
      });
    }, [rollSettings.catchPlayhead, playbackApi, timelineMsToTick, size.width]);

    // ── Wheel ─────────────────────────────────────────────────────────────
    useEffect(() => {
      const el = eventsRef.current;
      if (!el) return;
      const onWheel = (event: WheelEvent) => {
        const { zoomDelta, scrollDelta } = partitionTimelineWheel(event);
        if (zoomDelta !== 0) {
          event.preventDefault();
          const rect = el.getBoundingClientRect();
          const cursorX = event.clientX - rect.left;
          const geo = geometryRef.current;
          const anchorTick = xToTick(cursorX, geo);
          const factor = zoomDelta < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
          const next = Math.min(MAX_PX_PER_TICK, Math.max(MIN_PX_PER_TICK, geo.pxPerTick * factor));
          setPxPerTick(next);
          setScrollTick(Math.max(0, anchorTick - cursorX / next));
          return;
        }
        if (scrollDelta !== 0) {
          event.preventDefault();
          if (playbackApi.getState().isPlaying && rollSettingsRef.current.catchPlayhead) {
            setRollSettings({ catchPlayhead: false });
          }
          setScrollTick((tick) => Math.max(0, tick + scrollDelta / geometryRef.current.pxPerTick));
          return;
        }
        if (event.deltaY !== 0) {
          event.preventDefault();
          setScrollTop((top) => Math.max(0, top + event.deltaY));
        }
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }, [playbackApi, setRollSettings]);

    // ── Grid lines ────────────────────────────────────────────────────────
    const { barTicks, stepLines } = useMemo(() => {
      const none = { barTicks: [] as number[], stepLines: [] as number[] };
      if (size.width <= 0) return none;
      const fromTick = xToTick(0, geometry);
      const toTick = xToTick(size.width, geometry);
      const fromMs = Math.max(0, tickToTimelineMs(fromTick));
      const toMs = tickToTimelineMs(toTick);
      if (!(toMs > fromMs)) return none;
      const barPx = beatTicks * tempo.timeSignature.beatsPerBar * pxPerTick;
      const stepPx = gridStepTicks * pxPerTick;
      return {
        barTicks:
          barPx >= MIN_LINE_GAP_PX
            ? visibleTempoGrid({ tempo, fromMs, toMs, division: "bar" }).map(timelineMsToTick)
            : [],
        stepLines:
          stepPx >= MIN_LINE_GAP_PX
            ? stepLineTicks(fromTick, toTick, gridStepTicks, gridPhaseTick)
            : []
      };
    }, [
      size.width, geometry, tempo, pxPerTick, beatTicks, gridStepTicks,
      gridPhaseTick, tickToTimelineMs, timelineMsToTick
    ]);

    // ── Drawing ───────────────────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || size.width <= 0 || size.height <= 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const colors = pickStepEditorColors(theme, activeMode === "light" ? "light" : "dark");
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      canvas.width = size.width * dpr;
      canvas.height = size.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = colors.whiteRow;
      ctx.fillRect(0, 0, size.width, size.height);
      const windowStartX = tickToX(windowFromTick, geometry);
      const windowEndX = tickToX(windowToTick, geometry);
      const first = Math.max(0, Math.floor(scrollTop / rowHeightPx));
      const last = Math.min(lanes.length - 1, Math.floor((scrollTop + size.height) / rowHeightPx));
      for (let i = first; i <= last; i++) {
        const lane = lanes[i]!;
        const top = i * rowHeightPx - scrollTop;
        const selected = lane.key === selectedLane?.key;
        ctx.fillStyle = selected ? colors.selectedRow : colors.whiteRow;
        ctx.fillRect(0, top, size.width, rowHeightPx);
        ctx.fillStyle = colors.outsideWindow;
        if (windowStartX > 0) ctx.fillRect(0, top, windowStartX, rowHeightPx);
        if (windowEndX < size.width) ctx.fillRect(windowEndX, top, size.width - windowEndX, rowHeightPx);
        ctx.lineWidth = 1;
        ctx.strokeStyle = colors.gridLine;
        ctx.beginPath();
        for (const tick of stepLines) {
          const x = Math.round(tickToX(tick, geometry)) + 0.5;
          ctx.moveTo(x, top);
          ctx.lineTo(x, top + rowHeightPx);
        }
        ctx.stroke();
        ctx.strokeStyle = colors.barLine;
        ctx.beginPath();
        for (const tick of barTicks) {
          const x = Math.round(tickToX(tick, geometry)) + 0.5;
          ctx.moveTo(x, top);
          ctx.lineTo(x, top + rowHeightPx);
        }
        ctx.moveTo(0, top + rowHeightPx - 0.5);
        ctx.lineTo(size.width, top + rowHeightPx - 0.5);
        ctx.stroke();

        const params = settings.laneParams[lane.key] ?? DEFAULT_STEP_LANE_PARAMS;
        for (const event of eventsByLane[i] ?? []) {
          const x = tickToX(event.tick, geometry);
          if (x + params.penWidth < 0 || x > size.width) continue;
          const box = beamBox(lane, event.value, rowHeightPx);
          const palette = beamColors(
            colors,
            lane.type === "note" ? event.value : null,
            selectedIds.has(event.id)
          );
          ctx.globalAlpha = event.muted ? colors.mutedAlpha : 1;
          ctx.fillStyle = palette.fill;
          ctx.fillRect(x, top + box.top, params.penWidth, box.height);
          if (params.style === "frames") {
            ctx.strokeStyle = palette.frame;
            ctx.strokeRect(x + 0.5, top + box.top + 0.5, Math.max(0, params.penWidth - 1), Math.max(0, box.height - 1));
          }
          ctx.globalAlpha = 1;
        }
      }
      ctx.strokeStyle = colors.preview;
      if (overlay.line) {
        const { laneIndex, x0, y0, x1, y1 } = overlay.line;
        const top = laneIndex * rowHeightPx - scrollTop;
        ctx.beginPath();
        ctx.moveTo(x0, top + y0);
        ctx.lineTo(x1, top + y1);
        ctx.stroke();
      }
      if (overlay.marquee) {
        const m = overlay.marquee;
        const top = m.laneIndex * rowHeightPx - scrollTop;
        ctx.fillStyle = colors.marquee;
        ctx.fillRect(m.left, top + m.top, m.right - m.left, m.bottom - m.top);
        ctx.strokeRect(m.left + 0.5, top + m.top + 0.5, m.right - m.left, m.bottom - m.top);
      }
    }, [
      theme, activeMode, size, geometry, lanes, eventsByLane, selectedLane?.key, selectedIds,
      settings.laneParams, barTicks, stepLines, scrollTop, rowHeightPx, overlay,
      windowFromTick, windowToTick
    ]);

    // ── Writing ───────────────────────────────────────────────────────────
    const latestDoc = useCallback((): StepDoc => {
      const stored = findClipById(docApi.getState().clips, clipId);
      return { notes: stored?.notes ?? [], controllers: stored?.controllers ?? [] };
    }, [clipId, docApi]);

    /** Write what changed between two documents. One undo entry outside a gesture. */
    const applyDoc = useCallback(
      (next: StepDoc, prev: StepDoc): void => {
        if (!docChanged(prev, next)) return;
        const single = gestureRef.current === null;
        if (single) history.begin();
        if (next.notes !== prev.notes) {
          setClipNotes(clipId, next.notes);
          history.mark();
        }
        if (next.controllers !== prev.controllers) {
          setClipControllers(clipId, next.controllers);
          history.mark();
        }
        if (single) history.end();
      },
      [clipId, history, setClipControllers, setClipNotes]
    );

    const audition = useCallback(
      (pitch: number, velocity?: number) => {
        if (!instrument || !rollSettingsRef.current.midiOut) return;
        void playAuditionNote(instrument, pitch, velocity).catch(() => undefined);
      },
      [instrument]
    );

    const selectIds = useCallback((ids: ReadonlySet<string>) => {
      selectedIdsRef.current = ids;
      setSelectedIds(ids);
    }, []);

    // ── Position display ──────────────────────────────────────────────────
    const writePosition = (pitch: number | null, tick: number | null): void => {
      const el = positionRef.current;
      if (!el) return;
      el.textContent = tick === null ? "" : positionText(pitch, tickToTimelineMs(tick), tempo);
    };
    const showSelectionPosition = (): void => {
      let best: { tick: number; pitch: number | null } | null = null;
      lanesRef.current.forEach((lane, i) => {
        for (const event of eventsByLane[i] ?? []) {
          if (!selectedIdsRef.current.has(event.id)) continue;
          if (best === null || event.tick < best.tick) {
            best = { tick: event.tick, pitch: lane.type === "note" ? lane.pitch ?? null : null };
          }
        }
      });
      const found = best as { tick: number; pitch: number | null } | null;
      if (found) writePosition(found.pitch, found.tick);
      else writePosition(null, null);
    };
    useEffect(() => {
      if (!hoveringRef.current && !gestureRef.current) showSelectionPosition();
    });

    // ── Pointer gestures ──────────────────────────────────────────────────
    const localPoint = (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const rowAt = (localY: number) => {
      const rowH = rowHeightRef.current;
      const abs = localY + scrollTopRef.current;
      const index = Math.floor(abs / rowH);
      const lane = lanesRef.current[index];
      return lane ? { lane, index, yIn: abs - index * rowH } : null;
    };
    const rowIndexOf = (lane: StepLaneView): number =>
      lanesRef.current.findIndex((l) => l.key === lane.key);
    const tickToXNow = (tick: number): number => tickToX(tick, geometryRef.current);
    const clampY = (yIn: number): number => Math.min(rowHeightRef.current, Math.max(0, yIn));
    const valueAtY = (lane: StepLaneView, yIn: number): number =>
      valueFromY(clampY(yIn), rowHeightRef.current, lane.min, lane.max);
    const stepLength = (params: StepLaneParams, step: number): number =>
      params.length ?? Math.max(1, Math.round(step));

    const pencilTo = (g: Extract<Gesture, { kind: "pencil" }>, x: number, yIn: number): void => {
      const tick = xToTick(x, geometryRef.current);
      const start = stepStartTick(tick, g.step, gridPhaseTick);
      const value = valueAtY(g.lane, yIn);
      if (g.lastStart === start && g.lastValue === value) return;
      const from = g.lastStart ?? start;
      const fromValue = g.lastStart === null ? value : g.lastValue;
      const count = Math.min(MAX_STEPS_PER_MOVE, Math.round(Math.abs(start - from) / g.step));
      const dir = start >= from ? 1 : -1;
      let next = g.doc;
      for (let i = g.lastStart === null ? 0 : 1; i <= count; i++) {
        const v = count === 0 ? value : Math.round(fromValue + ((value - fromValue) * i) / count);
        next = drawIntoLane(next, g.lane, from + dir * i * g.step, g.step, v, { length: g.length });
      }
      g.lastStart = start;
      g.lastValue = value;
      const grew = next.notes.length > g.doc.notes.length;
      applyDoc(next, g.doc);
      g.doc = next;
      if (grew && g.lane.pitch !== undefined) audition(g.lane.pitch, value);
    };

    const eraseTo = (g: Extract<Gesture, { kind: "erase" }>, x: number, yIn: number): void => {
      const rect = {
        left: Math.min(g.lastX, x),
        right: Math.max(g.lastX, x),
        top: Math.min(g.lastY, yIn),
        bottom: Math.max(g.lastY, yIn)
      };
      g.lastX = x;
      g.lastY = yIn;
      const current = latestDoc();
      const ids = eventsInRect(
        g.lane,
        laneEvents(g.lane, current),
        rowHeightRef.current,
        tickToXNow,
        g.params.penWidth,
        rect
      );
      if (ids.length === 0) return;
      const doomed = new Set(ids);
      applyDoc(removeEvents(current, doomed), current);
      if ([...doomed].some((id) => selectedIdsRef.current.has(id))) {
        selectIds(new Set([...selectedIdsRef.current].filter((id) => !doomed.has(id))));
      }
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
      if (e.button !== 0) return;
      rootRef.current?.focus();
      const { x, y } = localPoint(e);
      const row = rowAt(y);
      if (!row) {
        if (!e.shiftKey) selectIds(new Set());
        return;
      }
      const { lane, index, yIn } = row;
      setSelectedLaneKey(lane.key);
      const params = paramsOf(lane);
      const tool = resolveTool<StepEditorTool>(e, mac, settingsRef.current.tool, settingsRef.current.altTool);
      const step = divisionToTicks(params.grid);
      e.currentTarget.setPointerCapture?.(e.pointerId);
      if (tool === "pencil") {
        history.begin();
        const g: Gesture = {
          kind: "pencil", lane, step, length: stepLength(params, step),
          doc: latestDoc(), lastStart: null, lastValue: 0
        };
        gestureRef.current = g;
        pencilTo(g, x, yIn);
        return;
      }
      if (tool === "line") {
        history.begin();
        const tick = xToTick(x, geometryRef.current);
        gestureRef.current = {
          kind: "line", lane, step, length: stepLength(params, step),
          t0: tick, v0: valueAtY(lane, yIn)
        };
        setOverlay({ line: { laneIndex: index, x0: x, y0: clampY(yIn), x1: x, y1: clampY(yIn) } });
        return;
      }
      if (tool === "eraser") {
        // A lane the eraser empties stays on screen for the session.
        if (lane.pitch !== undefined) {
          const pitch = lane.pitch;
          setExtraPitches((prev) => (prev.includes(pitch) ? prev : [...prev, pitch]));
        } else if (lane.target) {
          const target = lane.target;
          setPendingTargets((prev) =>
            prev.some((p) => controllerLaneView(p).key === lane.key) ? prev : [...prev, target]
          );
        }
        history.begin();
        const g: Gesture = { kind: "erase", lane, params, lastX: x, lastY: yIn };
        gestureRef.current = g;
        eraseTo(g, x, yIn);
        return;
      }
      // Pointer
      const current = latestDoc();
      const events = laneEvents(lane, current);
      const hit = hitBeam(lane, events, rowHeightRef.current, tickToXNow, params.penWidth, x, yIn);
      if (hit) {
        const was = selectedIdsRef.current;
        if (e.shiftKey) {
          const next = new Set(was);
          if (next.has(hit.id)) next.delete(hit.id);
          else next.add(hit.id);
          selectIds(next);
          return;
        }
        const chosen = was.has(hit.id) ? was : new Set([hit.id]);
        if (!was.has(hit.id)) selectIds(chosen);
        const laneIds = new Set(events.map((ev) => ev.id));
        gestureRef.current = {
          kind: "drag", lane,
          ids: new Set([...chosen].filter((id) => laneIds.has(id))),
          baseline: current, last: current, startY: e.clientY, begun: false
        };
        if (lane.pitch !== undefined) audition(lane.pitch, hit.value);
        return;
      }
      gestureRef.current = {
        kind: "marquee", lane, laneIndex: index, additive: e.shiftKey,
        baseIds: e.shiftKey ? selectedIdsRef.current : new Set(),
        startX: x, startY: yIn, moved: false
      };
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
      const { x, y } = localPoint(e);
      const g = gestureRef.current;
      if (!g) {
        hoveringRef.current = true;
        const row = rowAt(y);
        const tool = resolveTool<StepEditorTool>(e, mac, settingsRef.current.tool, settingsRef.current.altTool);
        setCursor(tool === "pointer" ? "default" : tool === "eraser" ? "not-allowed" : "crosshair");
        writePosition(
          row && row.lane.type === "note" ? row.lane.pitch ?? null : null,
          row ? xToTick(x, geometryRef.current) : null
        );
        return;
      }
      const rowTop = rowIndexOf(g.lane) * rowHeightRef.current - scrollTopRef.current;
      const yIn = y - rowTop;
      writePosition(g.lane.type === "note" ? g.lane.pitch ?? null : null, xToTick(x, geometryRef.current));
      if (g.kind === "pencil") pencilTo(g, x, yIn);
      else if (g.kind === "erase") eraseTo(g, x, yIn);
      else if (g.kind === "line") {
        setOverlay((prev) =>
          prev.line
            ? { line: { ...prev.line, x1: x, y1: clampY(yIn) } }
            : prev
        );
      } else if (g.kind === "drag") {
        const dy = e.clientY - g.startY;
        if (!g.begun) {
          if (Math.abs(dy) < DRAG_THRESHOLD_PX) return;
          g.begun = true;
          history.begin();
        }
        const range = g.lane.max - g.lane.min;
        const delta = Math.round((-dy / rowHeightRef.current) * range);
        const next = shiftEventValues(g.baseline, g.ids, delta);
        applyDoc(next, g.last);
        g.last = next;
      } else {
        if (!g.moved && Math.hypot(x - g.startX, yIn - g.startY) < DRAG_THRESHOLD_PX) return;
        g.moved = true;
        const rect = {
          left: Math.min(g.startX, x),
          right: Math.max(g.startX, x),
          top: clampY(Math.min(g.startY, yIn)),
          bottom: clampY(Math.max(g.startY, yIn))
        };
        setOverlay({ marquee: { laneIndex: g.laneIndex, ...rect } });
        const ids = eventsInRect(
          g.lane,
          laneEvents(g.lane, latestDoc()),
          rowHeightRef.current,
          tickToXNow,
          paramsOf(g.lane).penWidth,
          rect
        );
        selectIds(new Set([...g.baseIds, ...ids]));
      }
    };

    const finishGesture = (e: React.PointerEvent<HTMLDivElement> | null): void => {
      const g = gestureRef.current;
      if (!g) return;
      if (g.kind === "line" && e) {
        const { x, y } = localPoint(e);
        const rowTop = rowIndexOf(g.lane) * rowHeightRef.current - scrollTopRef.current;
        const t1 = xToTick(x, geometryRef.current);
        const v1 = valueAtY(g.lane, y - rowTop);
        const before = latestDoc();
        let next = before;
        for (const s of lineSteps(g.t0, g.v0, t1, v1, g.step, gridPhaseTick)) {
          next = drawIntoLane(next, g.lane, s.tick, g.step, s.value, { length: g.length });
        }
        applyDoc(next, before);
      } else if (g.kind === "marquee" && !g.moved && !g.additive) {
        selectIds(new Set());
      }
      gestureRef.current = null;
      setOverlay({});
      history.end();
    };

    // ── Lane actions ──────────────────────────────────────────────────────
    const selectLane = useCallback((key: string) => setSelectedLaneKey(key), []);

    const createControllerLane = useCallback(
      (target: MidiControllerTarget) => {
        const view = controllerLaneView(target);
        if (settingsRef.current.laneSet !== "automatic") setSettings({ laneSet: "automatic" });
        const existing = lanesRef.current.find((l) => l.key === view.key);
        if (!existing) {
          const stored = latestDoc().controllers;
          if (stored.length >= MIDI_MAX_CONTROLLER_LANES_PER_CLIP) {
            // The store validates the list, refuses it and shows its notice.
            const probe: MidiControllerLane = {
              id: "refused",
              kind: target.kind,
              cc: target.cc,
              points: [{ id: "refused", tick: 0, value: 0 }]
            };
            setClipControllers(clipId, [...stored, probe]);
            return;
          }
          setPendingTargets((prev) => [...prev, target]);
        }
        setSelectedLaneKey(view.key);
      },
      [clipId, latestDoc, setClipControllers, setSettings]
    );

    const createNoteLane = useCallback(
      (pitch: number) => {
        if (settingsRef.current.laneSet !== "automatic") setSettings({ laneSet: "automatic" });
        setHidden((prev) => {
          if (!prev.has(pitch)) return prev;
          const next = new Map(prev);
          next.delete(pitch);
          return next;
        });
        setExtraPitches((prev) => (prev.includes(pitch) ? prev : [...prev, pitch]));
        setSelectedLaneKey(noteLaneKey(pitch));
      },
      [setSettings]
    );

    const deleteLane = useCallback(() => {
      const lane = selectedLane;
      if (!lane || settingsRef.current.laneSet !== "automatic") return;
      if (lane.type === "note" && lane.pitch !== undefined) {
        const pitch = lane.pitch;
        setHidden((prev) =>
          new Map(prev).set(pitch, new Set(latestDoc().notes.filter((n) => n.pitch === pitch).map((n) => n.id)))
        );
        setExtraPitches((prev) => prev.filter((p) => p !== pitch));
      } else if (lane.target) {
        const target = lane.target;
        const stored = latestDoc();
        const next = setLanePoints(stored.controllers, target, []);
        applyDoc({ notes: stored.notes, controllers: next }, stored);
        setPendingTargets((prev) => prev.filter((p) => controllerLaneView(p).key !== lane.key));
      }
      selectIds(new Set());
      setSelectedLaneKey(null);
    }, [applyDoc, latestDoc, selectIds, selectedLane]);

    const requestDeleteLane = useCallback(() => {
      const lane = selectedLane;
      if (!lane) return;
      if (lane.type === "controller" && (eventsByLane[lanes.indexOf(lane)]?.length ?? 0) > 0) {
        setConfirmDelete(true);
        return;
      }
      deleteLane();
    }, [deleteLane, eventsByLane, lanes, selectedLane]);

    // ── Edit and Functions ────────────────────────────────────────────────
    const deleteSelected = useCallback(() => {
      const ids = selectedIdsRef.current;
      if (ids.size === 0) return;
      const current = latestDoc();
      applyDoc(removeEvents(current, ids), current);
      selectIds(new Set());
    }, [applyDoc, latestDoc, selectIds]);

    const selectAllInLane = useCallback(() => {
      const index = selectedLane ? lanesRef.current.findIndex((l) => l.key === selectedLane.key) : -1;
      const ids = index < 0 ? [] : laneEvents(lanesRef.current[index]!, latestDoc()).map((ev) => ev.id);
      selectIds(new Set(ids));
    }, [latestDoc, selectIds, selectedLane]);

    const applyScale = useCallback(
      (percent: number) => {
        const current = latestDoc();
        applyDoc(
          mapEventValues(current, selectedIdsRef.current, (v, r) => scaleValues([v], percent, r.min)[0]!),
          current
        );
      },
      [applyDoc, latestDoc]
    );
    const applySetValue = useCallback(
      (value: number) => {
        const current = latestDoc();
        applyDoc(mapEventValues(current, selectedIdsRef.current, () => value), current);
      },
      [applyDoc, latestDoc]
    );
    const thinOutSelected = useCallback(() => {
      const current = latestDoc();
      applyDoc(thinOutEvents(current, selectedIdsRef.current), current);
      selectIds(new Set());
    }, [applyDoc, latestDoc, selectIds]);

    const handleUndo = useCallback(() => timelineTemporalOf(docApi).undo(), [docApi]);
    const handleRedo = useCallback(() => timelineTemporalOf(docApi).redo(), [docApi]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (isNoteControl(e.target)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const handled = (): void => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (ctrl && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
        handled();
        if (gestureRef.current) return;
        if (e.shiftKey || e.key.toLowerCase() === "y") handleRedo();
        else handleUndo();
        return;
      }
      if (e.key === "Escape") {
        handled();
        if (selectedIdsRef.current.size > 0) selectIds(new Set());
        else onClose();
        return;
      }
      if (ctrl && e.key.toLowerCase() === "a") {
        handled();
        selectAllInLane();
        return;
      }
      if (gestureRef.current) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        handled();
        deleteSelected();
      }
    };

    // ── Zoom ──────────────────────────────────────────────────────────────
    const hZoom = Math.min(
      1,
      Math.max(0, Math.log(pxPerTick / MIN_PX_PER_TICK) / Math.log(MAX_PX_PER_TICK / MIN_PX_PER_TICK))
    );
    const handleHZoom = useCallback(
      (position: number) => {
        const geo = geometryRef.current;
        const centerX = size.width / 2;
        const anchorTick = xToTick(centerX, geo);
        const next = MIN_PX_PER_TICK * Math.pow(MAX_PX_PER_TICK / MIN_PX_PER_TICK, position);
        setPxPerTick(next);
        setScrollTick(Math.max(0, anchorTick - centerX / next));
      },
      [size.width]
    );

    // ── Menus ─────────────────────────────────────────────────────────────
    const L = (key: string) => t(`pass3_20.pianoRoll.logic.${key}`);
    const S = (key: string) => t(`pass3_20.stepEditor.${key}`);
    const mod = mac ? "⌘" : "Ctrl+";
    const noSelection = selectedIds.size === 0;
    const controllerChoices: Array<{ id: string; label: string; target: MidiControllerTarget }> = [
      { id: "volume", label: S("laneNames.volume"), target: { kind: "cc", cc: 7 } },
      { id: "modulation", label: S("laneNames.modulation"), target: { kind: "cc", cc: 1 } },
      { id: "pan", label: S("laneNames.pan"), target: { kind: "cc", cc: 10 } },
      { id: "expression", label: S("laneNames.expression"), target: { kind: "cc", cc: 11 } },
      { id: "sustain", label: S("laneNames.sustain"), target: { kind: "cc", cc: 64 } },
      { id: "pitchBend", label: S("laneNames.pitchBend"), target: { kind: "pitchBend" } },
      { id: "channelPressure", label: S("laneNames.channelPressure"), target: { kind: "channelPressure" } }
    ];
    const lanesMenu: MenuRow[] = [
      {
        id: "newController",
        label: S("menu.newControllerLane"),
        run: () => undefined,
        submenu: [
          ...controllerChoices.map((choice) => ({
            id: choice.id,
            label: choice.label,
            run: () => createControllerLane(choice.target)
          })),
          { id: "otherCc", label: S("menu.otherCc"), run: () => setDialog("otherCc") }
        ]
      },
      { id: "newNote", label: S("menu.newNoteLane"), run: () => setDialog("newNote") },
      {
        id: "deleteLane",
        label: S("menu.deleteLane"),
        disabled: !selectedLane || settings.laneSet !== "automatic",
        dividerBefore: true,
        run: requestDeleteLane
      }
    ];
    const editMenu: MenuRow[] = [
      { id: "undo", label: L("menu.undo"), shortcut: `${mod}Z`, run: handleUndo },
      { id: "redo", label: L("menu.redo"), shortcut: mac ? "⇧⌘Z" : "Ctrl+Y", run: handleRedo },
      { id: "delete", label: L("menu.delete"), shortcut: mac ? "⌫" : "Del", disabled: noSelection, dividerBefore: true, run: deleteSelected },
      { id: "selectAll", label: L("menu.selectAll"), shortcut: `${mod}A`, disabled: !selectedLane, dividerBefore: true, run: selectAllInLane },
      { id: "deselectAll", label: L("menu.deselectAll"), shortcut: "Esc", disabled: noSelection, run: () => selectIds(new Set()) }
    ];
    const functionsMenu: MenuRow[] = [
      { id: "scale", label: S("menu.scaleValues"), disabled: noSelection, run: () => setDialog("scale") },
      { id: "setValue", label: S("menu.setToValue"), disabled: noSelection, run: () => setDialog("setValue") },
      { id: "thin", label: S("menu.thinOut"), disabled: noSelection, run: thinOutSelected }
    ];
    const inspectorVisible = settings.inspector ?? !compact;
    const viewMenu: MenuRow[] = [
      { id: "inspector", label: S("menu.laneInspector"), checked: inspectorVisible, run: () => setSettings({ inspector: !inspectorVisible }) },
      { id: "catch", label: L("menu.catchPlayhead"), checked: rollSettings.catchPlayhead, run: () => setRollSettings({ catchPlayhead: !rollSettings.catchPlayhead }) }
    ];

    if (!clip) return null;
    const clipName = clip.name || t("pass3_20.pianoRoll.labels.midiClip");
    const clipColor = (clip as { color?: string }).color;

    return (
      <FlexColumn
        ref={rootRef}
        data-timeline-piano-roll
        data-testid="step-editor"
        tabIndex={0}
        role="application"
        aria-label={t("pass3_20.stepEditor.aria.editor", { name: clipName })}
        onKeyDown={handleKeyDown}
        css={rootStyles(theme)}
        fullWidth
        sx={{ flex: 1, minHeight: 0 }}
      >
        <StepEditorToolbar
          mac={mac}
          lanesMenu={lanesMenu}
          editMenu={editMenu}
          functionsMenu={functionsMenu}
          viewMenu={viewMenu}
          tool={settings.tool}
          altTool={settings.altTool}
          onTool={(tool) => setSettings({ tool })}
          onAltTool={(altTool) => setSettings({ altTool })}
          pianoRollSettings={rollSettings}
          setPianoRollSettings={setRollSettings}
          positionRef={positionRef}
          hZoom={hZoom}
          onHZoom={handleHZoom}
          vZoom={vZoom}
          onVZoom={setVZoom}
          minVZoom={MIN_V_ZOOM}
          maxVZoom={MAX_V_ZOOM}
          start={toolbarStart}
          end={toolbarEnd}
        />
        <NumberDialog
          open={dialog === "otherCc"}
          title={S("dialogs.otherCcTitle")}
          label={S("dialogs.ccNumber")}
          confirmText={S("dialogs.create")}
          cancelText={S("dialogs.cancel")}
          initial={1}
          min={0}
          max={127}
          onConfirm={(cc) => createControllerLane({ kind: "cc", cc })}
          onClose={() => setDialog(null)}
        />
        <NumberDialog
          open={dialog === "newNote"}
          title={S("dialogs.newNoteTitle")}
          label={S("dialogs.pitch")}
          confirmText={S("dialogs.create")}
          cancelText={S("dialogs.cancel")}
          initial={60}
          min={0}
          max={127}
          onConfirm={createNoteLane}
          onClose={() => setDialog(null)}
        />
        <NumberDialog
          open={dialog === "scale"}
          title={S("dialogs.scaleTitle")}
          label={S("dialogs.percent")}
          confirmText={S("dialogs.apply")}
          cancelText={S("dialogs.cancel")}
          initial={100}
          min={0}
          max={200}
          onConfirm={applyScale}
          onClose={() => setDialog(null)}
        />
        <NumberDialog
          open={dialog === "setValue"}
          title={S("dialogs.setValueTitle")}
          label={S("dialogs.value")}
          confirmText={S("dialogs.apply")}
          cancelText={S("dialogs.cancel")}
          initial={selectedLane?.max ?? 127}
          min={selectedLane?.min ?? VELOCITY_MIN}
          max={selectedLane?.max ?? 127}
          onConfirm={applySetValue}
          onClose={() => setDialog(null)}
        />
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={deleteLane}
          title={S("dialogs.deleteLaneTitle")}
          content={S("dialogs.deleteLaneBody")}
          confirmText={S("dialogs.delete")}
          cancelText={S("dialogs.cancel")}
          destructive
        />
        <FlexRow fullWidth sx={{ flex: 1, minHeight: 0 }}>
          {inspectorVisible && (
            <StepEditorInspector
              clipName={clipName}
              laneSet={settings.laneSet}
              onLaneSet={(laneSet) => setSettings({ laneSet })}
              lane={selectedLane}
              laneName={selectedLane ? laneName(selectedLane) : ""}
              params={selectedParams}
              gridTicks={gridStepTicks}
              onParams={(patch) => {
                if (selectedLane) setLaneParams(selectedLane.key, patch);
              }}
            />
          )}
          <FlexColumn sx={{ width: LANE_NAME_WIDTH_PX, flexShrink: 0, borderRight: `1px solid ${theme.vars.palette.divider}` }}>
            <div style={{ height: PIANO_ROLL_RULER_HEIGHT_PX + REGION_STRIP_HEIGHT_PX, flexShrink: 0 }} />
            <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>
              <div style={{ transform: `translateY(${-scrollTop}px)` }}>
                {lanes.map((lane) => {
                  const selected = lane.key === selectedLane?.key;
                  return (
                    <FlexRow
                      key={lane.key}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selected}
                      data-testid={`step-editor-lane-${lane.key}`}
                      align="center"
                      gap={SPACING.xs}
                      onClick={() => selectLane(lane.key)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectLane(lane.key);
                        }
                      }}
                      sx={{
                        height: rowHeightPx,
                        px: SPACING.sm,
                        cursor: "pointer",
                        overflow: "hidden",
                        borderBottom: `1px solid ${theme.vars.palette.divider}`,
                        backgroundColor: selected ? theme.vars.palette.action.hover : "transparent"
                      }}
                    >
                      <StatusDot tone={selected ? "primary" : "neutral"} />
                      <Text size="small" truncate>{laneName(lane)}</Text>
                    </FlexRow>
                  );
                })}
              </div>
            </div>
          </FlexColumn>
          <FlexColumn sx={{ flex: 1, minWidth: 0 }}>
            <PianoRollRuler
              geometry={geometry}
              widthPx={size.width}
              tempo={tempo}
              tickToTimelineMs={tickToTimelineMs}
              timelineMsToTick={timelineMsToTick}
              onSeekTick={(tick) => playbackApi.getState().seek(Math.max(0, tickToTimelineMs(tick)))}
            />
            <PianoRollRegionStrip
              geometry={geometry}
              widthPx={size.width}
              windowFromTick={windowFromTick}
              windowToTick={windowToTick}
              name={clipName}
              clipColor={clipColor}
            />
            <div
              ref={eventsRef}
              css={eventsWrapStyles}
              style={{ cursor }}
              data-testid="step-editor-events"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={(e) => finishGesture(e)}
              onPointerCancel={() => finishGesture(null)}
              onPointerLeave={() => {
                hoveringRef.current = false;
                if (!gestureRef.current) showSelectionPosition();
              }}
            >
              <canvas
                ref={canvasRef}
                data-testid="step-editor-canvas"
                style={{ display: "block", width: "100%", height: "100%" }}
                aria-hidden
              />
              {lanes.length === 0 && (
                <FlexRow
                  align="center"
                  justify="center"
                  sx={{ position: "absolute", inset: 0, pointerEvents: "none", px: SPACING.md }}
                >
                  <Caption color="muted">{S("empty")}</Caption>
                </FlexRow>
              )}
              <div ref={playheadRef} css={playheadStyles(theme)} aria-hidden />
            </div>
          </FlexColumn>
        </FlexRow>
      </FlexColumn>
    );
  }
);

StepEditor.displayName = "StepEditor";
