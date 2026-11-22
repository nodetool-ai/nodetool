/** @jsxImportSource @emotion/react */
/**
 * PianoRoll — the clip editor for one midi clip.
 *
 * A keyboard column, a bars:beats ruler, the note grid and a velocity lane,
 * over the clip's *content* rather than its window: notes the window does not
 * reach are drawn under a shade, because a trim hides notes instead of
 * deleting them and the panel has to show what a longer window brings back.
 *
 * Every pointer gesture is one undo entry. The gesture writes through
 * `setClipNotes` on each move — the preview's audio top-up pass re-renders the
 * clip as it goes, so an edit is audible while the timeline plays — and the
 * temporal middleware is paused for the duration through
 * `useTimelineHistoryBatch`, exactly as a clip drag does it. Keyboard actions
 * write once each, so they need no batch.
 *
 * The panel is focusable and handles its own keys; `TracksRegion`'s window
 * handler skips events from inside `[data-timeline-piano-roll]`, so Delete
 * removes notes here and clips out there.
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
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  applyNoOverlap,
  createTimeOrderedUuid,
  barDurationMs,
  beatDurationMs,
  divisionToTicks,
  duplicateNotes,
  expandClipHarmony,
  fitExpressionToDuration,
  isHarmonyActive,
  moveNotes,
  msToTicks,
  notesInRect,
  findControllerLane,
  removeNotes,
  resizeNotes,
  resolveTempo,
  setExpressionPoints,
  setLanePoints,
  smartSnapTicks,
  snapPitchToScale,
  splitNote,
  glueNotes,
  ticksToMs
} from "@nodetool-ai/timeline";
import type {
  MidiNote,
  QuantizeDivision,
  NoteRect,
  TempoGridDivision,
  TimelineTempo
} from "@nodetool-ai/timeline";

import { useTimelineStore, useTimelineStoreApi, timelineTemporalOf } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import type { PianoRollTool } from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStoreApi } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { Caption, Dialog, EditorButton, FlexColumn, FlexRow, SelectField, SPACING, TextInput } from "../../ui_primitives";
import { playAuditionNote } from "../preview/audition";
import { partitionTimelineWheel } from "../Tracks/timelineWheel";
import { visibleTempoGrid } from "../Tracks/tempoGrid";
import { PianoRollGrid } from "./PianoRollGrid";
import { PianoRollToolbar } from "./PianoRollToolbar";
import { PianoRollInspector } from "./PianoRollInspector";
import { PianoRollRegionStrip, REGION_STRIP_HEIGHT_PX } from "./PianoRollRegionStrip";
import { usePianoRollFunctions } from "./usePianoRollFunctions";
import {
  addStepNote,
  bypassesSnap,
  collapseRowSet,
  defaultScaleRoot,
  earliestVelocity,
  hasNoteAt,
  isMacPlatform,
  moveNotesByRows,
  positionText,
  resolveTool,
  scaleSnapFor,
  shiftVelocity,
  snapMovedToScale,
  stepLineTicks,
  stepStartTick,
  toggleMuteAt,
  toolCursor
} from "./pianoRollTools";
import { PianoRollKeyboard, KEYBOARD_WIDTH_PX } from "./PianoRollKeyboard";
import {
  PianoRollRuler,
  PIANO_ROLL_RULER_HEIGHT_PX
} from "./PianoRollRuler";
import {
  PianoRollVelocityLane,
  VELOCITY_LANE_HEIGHT_PX
} from "./PianoRollVelocityLane";
import { PianoRollCurveLane } from "./PianoRollCurveLane";
import {
  CONTROLLER_LANE_VALUES,
  EXPRESSION_LANE_VALUES,
  expressionCurveRange,
  laneExpressionKind,
  laneTarget,
  type CurvePoint,
  type LaneCurve,
  type LaneValue
} from "./pianoRollLanes";
import {
  hitTestNote,
  initialTopPitch,
  type RowSet,
  snapTickToGrid,
  tickToX,
  xToTick,
  yToPitch,
  type NoteHitEdge,
  type PianoRollGeometry
} from "./pianoRollGeometry";

import { decodeNoteClipboard, encodeNoteClipboard, pasteNotes } from "./noteClipboard";

const isNoteControl = (target: EventTarget) => target instanceof HTMLElement &&
  target.closest("input, select, textarea, button, [role=combobox], [role=listbox], [role=option], [role=dialog], [contenteditable=true]") !== null;

/** Height of one semitone row at the default vertical zoom. */
const ROW_HEIGHT_PX = 16;
/** The vertical zoom sliders's range, as a factor of the default row height. */
const MIN_V_ZOOM = 0.5;
const MAX_V_ZOOM = 2;
/** Catch Playhead puts the playhead this far in from the left edge. */
const CATCH_PLAYHEAD_FRACTION = 0.05;
/** Zoom to Fit leaves this much room around the notes. */
const FIT_MARGIN = 1.1;
/** Zoom bounds, in pixels per tick. */
const MIN_PX_PER_TICK = 0.002;
const MAX_PX_PER_TICK = 1;
/** One wheel notch's zoom factor, matching the tracks region's feel. */
const ZOOM_STEP = 1.15;
/** Height of the lane selector row above the lane. */
const LANE_HEADER_HEIGHT_PX = 32;
/** Grid lines closer together than this are not drawn. */
const MIN_LINE_GAP_PX = 4;
/** How far a pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 3;

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

const gridWrapStyles = css({
  position: "relative",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  touchAction: "none",
  cursor: "crosshair"
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

/** How many ticks one step of the editor's grid division spans. */
export function gridDivisionTicks(
  division: TempoGridDivision,
  tempo: TimelineTempo
): number {
  if (division === "bar" || division === "beat") {
    // Read the division's duration against the tempo and convert back, so 6/8
    // gets an eighth-note beat and a three-beat bar without a second formula.
    const ms =
      division === "bar" ? barDurationMs(tempo) : beatDurationMs(tempo);
    return msToTicks(ms, tempo.bpm);
  }
  return divisionToTicks(division);
}

/** What a pointer gesture on the grid is doing. */
type GridDrag =
  | {
      kind: "move" | "resize";
      ids: string[];
      baseline: MidiNote[];
      anchorTick: number;
      pointerStartTick: number;
      pointerStartPitch: number;
      lastPitch: number;
      startX: number;
      startY: number;
      moved: boolean;
      duplicate: boolean;
    }
  | { kind: "pencil"; id: string; startTick: number; startX: number; startY: number; moved: boolean }
  | { kind: "erase" }
  | { kind: "brush"; last: string | null; lastAuditionPitch: number }
  | { kind: "velocity"; ids: ReadonlySet<string>; baseline: MidiNote[]; startY: number }
  | {
      kind: "marquee";
      additiveIds: readonly string[];
      additive: boolean;
      startTick: number;
      startPitch: number;
      startX: number;
      startY: number;
      moved: boolean;
    };

interface PianoRollProps {
  clipId: string;
  /** Closes the panel — Escape with nothing selected. */
  onClose: () => void;
  /** Controls placed first in the toolbar row (the phone Back button). */
  toolbarStart?: ReactNode;
  /** Phone layout: the local inspector starts hidden. */
  compact?: boolean;
  /** Controls pinned to the right end of the toolbar row (the panel's Close). */
  toolbarEnd?: ReactNode;
}

export const PianoRoll: React.FC<PianoRollProps> = memo(
  ({ clipId, onClose, toolbarStart, toolbarEnd, compact = false }) => {
    const { t } = useTranslation();
    const theme = useTheme();
    const clip = useTimelineStore((s) => findClipById(s.clips, clipId));
    const tempo = useTimelineStore((s) => resolveTempo(s));
    const setClipNotes = useTimelineStore((s) => s.setClipNotes);
    const setClipControllers = useTimelineStore((s) => s.setClipControllers);
    const trackId = clip?.trackId;
    const trackName = useTimelineStore((s) => s.tracks.find((tr) => tr.id === trackId)?.name ?? "");
    const instrument = useTimelineStore(
      (s) => s.tracks.find((t) => t.id === trackId)?.instrument
    );
    const settings = useTimelineUIStore((s) => s.pianoRollSettings);
    const setSettings = useTimelineUIStore((s) => s.setPianoRollSettings);
    const snapEnabled = settings.snapOn;
    const settingsRef = useRef(settings);
    settingsRef.current = settings;
    const mac = useMemo(() => isMacPlatform(), []);
    const docApi = useTimelineStoreApi();
    const playbackApi = useTimelinePlaybackStoreApi();
    const history = useTimelineHistoryBatch();

    const notes = useMemo(() => clip?.notes ?? [], [clip?.notes]);
    const tracks = useTimelineStore((s) => s.tracks);
    // A clip with harmony plays its arp or comp expansion: drawn read-only.
    const ghostNotes = useMemo(
      () =>
        clip && isHarmonyActive(clip.harmony)
          ? expandClipHarmony(clip, { tracks, tempo })
          : undefined,
      [clip, tracks, tempo]
    );
    const notesRef = useRef<ReadonlyArray<MidiNote>>(notes);
    notesRef.current = notes;

    const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
      () => new Set()
    );
    const selectedIdsRef = useRef(selectedIds);
    selectedIdsRef.current = selectedIds;

    const [size, setSize] = useState({ width: 0, height: 0 });
    const [pxPerTick, setPxPerTick] = useState(0.05);
    const [scrollTick, setScrollTick] = useState(0);
    const [topPitch, setTopPitch] = useState(72);
    const [topRow, setTopRow] = useState(0);
    const [vZoom, setVZoom] = useState(1);
    const rowHeightPx = Math.round(ROW_HEIGHT_PX * vZoom);
    // Collapse Mode rows come from the committed notes: a gesture freezes them.
    const [frozenRows, setFrozenRows] = useState<{ rows: RowSet | null } | null>(null);
    const frozenRowsRef = useRef(frozenRows);
    frozenRowsRef.current = frozenRows;
    const [marquee, setMarquee] = useState<NoteRect | null>(null);

    const gridWrapRef = useRef<HTMLDivElement | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const playheadRef = useRef<HTMLDivElement | null>(null);
    const createdOnClickRef = useRef<{ id: string; time: number } | null>(null);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [cursor, setCursor] = useState("default");
    const dragRef = useRef<GridDrag | null>(null);
    const velocityBaseline = useRef<readonly MidiNote[] | null>(null);
    const inspectorVelocityShown = useRef<number | null>(null);

    const liveRows = useMemo(
      () => (settings.collapse ? collapseRowSet(notes) : null),
      [settings.collapse, notes]
    );
    const rows = settings.collapse ? (frozenRows ? frozenRows.rows : liveRows) : null;
    const maxTopRow = rows
      ? Math.max(0, rows.pitches.length - Math.max(1, Math.floor(size.height / rowHeightPx)))
      : 0;
    const geometry: PianoRollGeometry = useMemo(
      () => ({
        pxPerTick,
        scrollTick,
        rowHeightPx,
        topPitch,
        ...(rows ? { rows, topRow: Math.min(topRow, maxTopRow) } : {})
      }),
      [pxPerTick, scrollTick, rowHeightPx, topPitch, rows, topRow, maxTopRow]
    );
    const geometryRef = useRef(geometry);
    geometryRef.current = geometry;

    const inPointMs = clip?.inPointMs ?? 0;
    const clipStartMs = clip?.startMs ?? 0;
    const durationMs = clip?.durationMs ?? 0;
    const bpm = tempo.bpm;

    const windowFromTick = useMemo(
      () => msToTicks(inPointMs, bpm),
      [inPointMs, bpm]
    );
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

    const beatTicks = useMemo(
      () => msToTicks(beatDurationMs(tempo), tempo.bpm),
      [tempo]
    );
    const beatsPerBar = tempo.timeSignature.beatsPerBar;
    const gridStepTicks = useMemo(
      () =>
        settings.snapValue === "smart"
          ? smartSnapTicks(pxPerTick, beatTicks, beatsPerBar)
          : gridDivisionTicks(settings.snapValue, tempo),
      [settings.snapValue, pxPerTick, beatTicks, beatsPerBar, tempo]
    );

    // Where the drawn grid sits in clip-content ticks: it is anchored at
    // `tempo.offsetMs` on the timeline, not at tick 0 of the clip's notes.
    const gridPhaseTick = useMemo(
      () => timelineMsToTick(tempo.offsetMs),
      [timelineMsToTick, tempo.offsetMs]
    );

    // ── Measurement ───────────────────────────────────────────────────────
    useEffect(() => {
      const el = gridWrapRef.current;
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

    // ── Opening view ──────────────────────────────────────────────────────
    // Frame the clip's window horizontally and its notes vertically, once per
    // clip. Re-running on every size change would fight the user's own zoom.
    const framedClipIdRef = useRef<string | null>(null);
    useEffect(() => {
      if (size.width <= 0 || size.height <= 0) return;
      if (framedClipIdRef.current === clipId) return;
      framedClipIdRef.current = clipId;
      const span = Math.max(1, windowToTick - windowFromTick);
      setPxPerTick(
        Math.min(MAX_PX_PER_TICK, Math.max(MIN_PX_PER_TICK, size.width / span))
      );
      setScrollTick(windowFromTick);
      setTopPitch(
        initialTopPitch(notesRef.current, size.height / rowHeightPx)
      );
      setSelectedIds(new Set());
    }, [clipId, size.width, size.height, windowFromTick, windowToTick]);

    // ── Focus ─────────────────────────────────────────────────────────────
    useEffect(() => {
      rootRef.current?.focus();
    }, [clipId]);

    // ── Playhead ──────────────────────────────────────────────────────────
    // Written straight into the DOM from the playback store's transient time
    // channel, so a playing timeline does not re-render the panel 60×/s.
    useEffect(() => {
      const api = playbackApi;
      const apply = (timeMs: number) => {
        const node = playheadRef.current;
        if (!node) return;
        const x = tickToX(timelineMsToTick(timeMs), geometryRef.current);
        node.style.transform = `translateX(${x}px)`;
        node.style.visibility = x >= 0 && x <= size.width ? "visible" : "hidden";
      };
      apply(api.getState().getTimeMs());
      return api.getState().subscribeTime(apply);
    }, [playbackApi, timelineMsToTick, size.width, geometry]);

    // ── Grid lines ────────────────────────────────────────────────────────
    // Bars strong, beats medium, the snap step faint when finer than a beat.
    // A level whose lines sit under MIN_LINE_GAP_PX apart is skipped.
    const { beatLines, stepLines, barTicks } = useMemo(() => {
      const none = { beatLines: [], stepLines: [], barTicks: [] };
      if (size.width <= 0) return none;
      const fromTick = xToTick(0, geometry);
      const toTick = xToTick(size.width, geometry);
      const fromMs = Math.max(0, tickToTimelineMs(fromTick));
      const toMs = tickToTimelineMs(toTick);
      if (!(toMs > fromMs)) return none;
      const spec = { tempo, fromMs, toMs };
      const barPx = beatTicks * beatsPerBar * pxPerTick;
      const beatPx = beatTicks * pxPerTick;
      const stepPx = gridStepTicks * pxPerTick;
      return {
        barTicks:
          barPx >= MIN_LINE_GAP_PX
            ? visibleTempoGrid({ ...spec, division: "bar" }).map(timelineMsToTick)
            : [],
        beatLines:
          beatPx >= MIN_LINE_GAP_PX
            ? visibleTempoGrid({ ...spec, division: "beat" }).map(timelineMsToTick)
            : [],
        stepLines:
          gridStepTicks < beatTicks - 1e-6 && stepPx >= MIN_LINE_GAP_PX
            ? stepLineTicks(fromTick, toTick, gridStepTicks, gridPhaseTick)
            : []
      };
    }, [
      size.width,
      geometry,
      tempo,
      pxPerTick,
      beatTicks,
      beatsPerBar,
      gridStepTicks,
      gridPhaseTick,
      tickToTimelineMs,
      timelineMsToTick
    ]);

    // ── Writing ───────────────────────────────────────────────────────────
    const commit = useCallback(
      (next: MidiNote[]) => {
        setClipNotes(clipId, next);
        history.mark();
      },
      [clipId, history, setClipNotes]
    );

    const audition = useCallback(
      (pitch: number, velocity?: number) => {
        if (!instrument || !settingsRef.current.midiOut) return;
        void playAuditionNote(instrument, pitch, velocity).catch(() => undefined);
      },
      [instrument]
    );

    /** The tick a pointer means, snapped unless the caller bypasses the grid. */
    const snapOrNot = useCallback(
      (tick: number, bypass: boolean) =>
        bypass || !snapEnabled
          ? Math.round(tick)
          : snapTickToGrid(tick, gridStepTicks, gridPhaseTick),
      [gridPhaseTick, gridStepTicks, snapEnabled]
    );

    /**
     * The clip's notes as the store holds them now. `notesRef` only catches up
     * on the next render, so a field that commits on blur (the note inspector)
     * can have written after the last render and before a gesture starts.
     */
    const latestNotes = useCallback((): ReadonlyArray<MidiNote> => {
      const stored = findClipById(docApi.getState().clips, clipId)?.notes ?? [];
      notesRef.current = stored;
      return stored;
    }, [clipId, docApi]);

    // ── Pointer gestures ──────────────────────────────────────────────────
    const localPoint = useCallback(
      (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
      },
      []
    );

    const selectIds = useCallback((ids: ReadonlySet<string>) => {
      selectedIdsRef.current = ids;
      setSelectedIds(ids);
    }, []);
    const write = useCallback(
      (next: MidiNote[]) => setClipNotes(clipId, next),
      [clipId, setClipNotes]
    );
    const scaleRoot = settings.scaleRoot ?? defaultScaleRoot(tempo);
    const scaleForQ = scaleSnapFor(settings.scaleId, scaleRoot);
    const scaleForQRef = useRef(scaleForQ);
    scaleForQRef.current = scaleForQ;
    const fns = usePianoRollFunctions({
      latestNotes,
      selectedIds: () => selectedIdsRef.current,
      setSelectedIds: selectIds,
      write,
      quantizeSettings: () => useTimelineUIStore.getState().quantizeSettings,
      gridPhaseTick,
      scale: () => scaleForQRef.current,
      playheadTick: () => Math.round(timelineMsToTick(playbackApi.getState().getTimeMs()))
    });

    // ── Position display ──────────────────────────────────────────────────
    // Written straight into the DOM: a pointer move must not re-render the roll.
    const positionRef = useRef<HTMLSpanElement | null>(null);
    const hoveringRef = useRef(false);
    const writePosition = (pitch: number | null, tick: number | null): void => {
      const el = positionRef.current;
      if (!el) return;
      el.textContent =
        tick === null ? "" : positionText(pitch, tickToTimelineMs(tick), tempo);
    };
    const showSelectionPosition = (): void => {
      const chosen = notesRef.current.filter((n) => selectedIdsRef.current.has(n.id));
      const first = chosen.reduce<MidiNote | null>(
        (best, n) => (best === null || n.startTick < best.startTick ? n : best),
        null
      );
      if (first) writePosition(first.pitch, first.startTick);
      else writePosition(null, null);
    };
    useEffect(() => {
      if (!hoveringRef.current && !dragRef.current) showSelectionPosition();
    });

    const freezeRows = (): void => {
      if (settingsRef.current.collapse) {
        setFrozenRows({ rows: geometryRef.current.rows ?? null });
      }
    };
    const thawRows = (): void => setFrozenRows(null);
    const rowOf = (pitch: number, geo: PianoRollGeometry): number =>
      geo.rows?.index.get(pitch) ?? 0;

    const eraseNote = (id: string): void => {
      commit(removeNotes(latestNotes(), [id]));
      if (selectedIdsRef.current.has(id)) {
        const next = new Set(selectedIdsRef.current);
        next.delete(id);
        selectIds(next);
      }
    };

    const paintBrush = (
      x: number,
      y: number,
      bypass: boolean,
      drag: Extract<GridDrag, { kind: "brush" }>
    ): void => {
      const geo = geometryRef.current;
      let pitch = yToPitch(y, geo);
      if (pitch < 0 || pitch > 127) return;
      const scale = settingsRef.current.snapToScale ? scaleForQRef.current : null;
      if (scale) pitch = snapPitchToScale(pitch, scale.root, scale.intervals);
      const start = stepStartTick(xToTick(x, geo), !bypass, gridStepTicks, gridPhaseTick);
      const key = `${pitch}:${start}`;
      if (drag.last === key) return;
      drag.last = key;
      const current = latestNotes();
      if (hasNoteAt(current, pitch, start)) return;
      commit(addStepNote(current, pitch, start, gridStepTicks));
      if (drag.lastAuditionPitch !== pitch) {
        drag.lastAuditionPitch = pitch;
        audition(pitch);
      }
    };

    /** Press with a tool other than Pointer. */
    const startToolGesture = (
      tool: PianoRollTool,
      e: React.PointerEvent<HTMLDivElement>,
      hit: ReturnType<typeof hitTestNote>,
      gestureNotes: ReadonlyArray<MidiNote>,
      x: number,
      y: number
    ): void => {
      const geo = geometryRef.current;
      const pointerTick = xToTick(x, geo);
      const bypass = bypassesSnap(e, mac);
      switch (tool) {
        case "pencil": {
          let pitch = yToPitch(y, geo);
          if (pitch < 0 || pitch > 127) return;
          const scale = settingsRef.current.snapToScale ? scaleForQRef.current : null;
          if (scale) pitch = snapPitchToScale(pitch, scale.root, scale.intervals);
          const start = stepStartTick(pointerTick, snapEnabled && !bypass, gridStepTicks, gridPhaseTick);
          history.begin();
          const created = addStepNote(gestureNotes, pitch, start, gridStepTicks);
          commit(created);
          const newest = created[created.length - 1]!;
          createdOnClickRef.current = { id: newest.id, time: e.timeStamp };
          selectIds(new Set([newest.id]));
          audition(pitch, newest.velocity);
          dragRef.current = {
            kind: "pencil", id: newest.id, startTick: start,
            startX: e.clientX, startY: e.clientY, moved: false
          };
          return;
        }
        case "eraser":
          history.begin();
          dragRef.current = { kind: "erase" };
          if (hit) eraseNote(hit.note.id);
          return;
        case "brush": {
          history.begin();
          const drag = { kind: "brush" as const, last: null, lastAuditionPitch: -1 };
          dragRef.current = drag;
          paintBrush(x, y, bypass, drag);
          return;
        }
        case "velocity":
          if (!hit) return;
          history.begin();
          dragRef.current = {
            kind: "velocity",
            ids: selectedIdsRef.current.has(hit.note.id)
              ? new Set(selectedIdsRef.current)
              : new Set([hit.note.id]),
            baseline: [...gestureNotes],
            startY: e.clientY
          };
          return;
        default:
      }
      if (!hit) return;
      const target = hit.note;
      if (tool === "scissors") {
        const tick = snapOrNot(pointerTick, bypass);
        if (tick <= target.startTick || tick >= target.startTick + target.durationTick) return;
        const [left, right] = splitNote(target, tick, createTimeOrderedUuid());
        write(gestureNotes.flatMap((n) => (n.id === target.id ? [left, right] : [n])));
      } else if (tool === "glue") {
        const next = glueNotes(gestureNotes, selectedIdsRef.current, target.id);
        write(next);
        const alive = new Set(next.map((n) => n.id));
        selectIds(new Set([...selectedIdsRef.current].filter((id) => alive.has(id))));
      } else if (tool === "mute") {
        write(toggleMuteAt(gestureNotes, target.id, selectedIdsRef.current));
      } else if (tool === "quantize") {
        fns.quantize({
          noteIds: selectedIdsRef.current.has(target.id)
            ? selectedIdsRef.current
            : [target.id]
        });
      }
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
      if (e.button !== 0) return;
      // Focusing first blurs any inspector field, which commits its edit.
      rootRef.current?.focus();
      const gestureNotes = latestNotes();
      const { x, y } = localPoint(e);
      const geo = geometryRef.current;
      const hit = hitTestNote(gestureNotes, x, y, geo);
      const pointerTick = xToTick(x, geo);
      const pointerPitch = yToPitch(y, geo);
      const s = settingsRef.current;
      let tool = resolveTool(e, mac, s.tool, s.altTool);
      if (tool === "pencil" && hit) tool = "pointer";
      freezeRows();
      const capture = (): void => {
        if (typeof e.currentTarget.setPointerCapture === "function") {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // No capture available: the gesture still runs inside the panel.
          }
        }
      };
      if (tool !== "pointer") {
        startToolGesture(tool, e, hit, gestureNotes, x, y);
        if (dragRef.current) capture();
        else thawRows();
        return;
      }

      if (hit) {
        const additive = e.shiftKey;
        let ids: string[];
        if (additive) {
          const next = new Set(selectedIdsRef.current);
          if (next.has(hit.note.id)) {
            next.delete(hit.note.id);
          } else {
            next.add(hit.note.id);
          }
          selectIds(next);
          // A shift-click toggles membership; it does not start a drag.
          thawRows();
          return;
        }
        if (selectedIdsRef.current.has(hit.note.id)) {
          ids = [...selectedIdsRef.current];
        } else {
          ids = [hit.note.id];
          selectIds(new Set(ids));
        }
        const edge: NoteHitEdge = hit.edge;
        dragRef.current = {
          kind: edge === "end" ? "resize" : "move",
          ids,
          baseline: [...gestureNotes],
          anchorTick:
            edge === "end"
              ? hit.note.startTick + hit.note.durationTick
              : hit.note.startTick,
          pointerStartTick: pointerTick,
          pointerStartPitch: pointerPitch,
          lastPitch: hit.note.pitch,
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
          duplicate: e.altKey && edge !== "end"
        };
        history.begin();
      } else {
        dragRef.current = {
          kind: "marquee",
          additive: e.shiftKey,
          additiveIds: e.shiftKey ? [...selectedIdsRef.current] : [],
          startTick: pointerTick,
          startPitch: pointerPitch,
          startX: e.clientX,
          startY: e.clientY,
          moved: false
        };
      }
      capture();
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
      const drag = dragRef.current;
      const { x, y } = localPoint(e);
      const geo = geometryRef.current;
      const pointerTick = xToTick(x, geo);
      const pointerPitch = yToPitch(y, geo);
      const bypassSnap = bypassesSnap(e, mac);
      if (!drag) {
        const s = settingsRef.current;
        const hit = hitTestNote(notesRef.current, x, y, geo);
        let tool = resolveTool(e, mac, s.tool, s.altTool);
        if (tool === "pencil" && hit) tool = "pointer";
        setCursor(
          tool === "pointer"
            ? hit ? hit.edge === "end" ? "ew-resize" : e.altKey ? "copy" : "grab" : toolCursor("pointer")
            : toolCursor(tool)
        );
        hoveringRef.current = true;
        writePosition(pointerPitch >= 0 && pointerPitch <= 127 ? pointerPitch : null, Math.max(0, pointerTick));
        return;
      }
      if (drag.kind === "erase") {
        const hit = hitTestNote(latestNotes(), x, y, geo);
        if (hit) eraseNote(hit.note.id);
        return;
      }
      if (drag.kind === "brush") {
        paintBrush(x, y, bypassSnap, drag);
        return;
      }
      if (drag.kind === "velocity") {
        commit(shiftVelocity(drag.baseline, drag.ids, drag.startY - e.clientY));
        return;
      }
      if (!drag.moved && Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD_PX &&
          Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD_PX) return;

      if (drag.kind === "pencil") {
        drag.moved = true;
        const end = snapOrNot(pointerTick, bypassSnap);
        const floor = snapEnabled && !bypassSnap ? gridStepTicks : 1;
        const durationTick = Math.max(Math.round(floor), end - drag.startTick);
        commit(
          latestNotes().map((n) =>
            n.id === drag.id ? fitExpressionToDuration({ ...n, durationTick }) : n
          )
        );
        return;
      }

      if (drag.kind === "marquee") {
        drag.moved = true;
        const rect: NoteRect = {
          fromTick: drag.startTick,
          toTick: pointerTick,
          minPitch: drag.startPitch,
          maxPitch: pointerPitch
        };
        setMarquee(rect);
        selectIds(
          new Set(
            [...drag.additiveIds, ...notesInRectIds(notesRef.current, rect)]
          )
        );
        return;
      }

      if (!drag.moved && drag.duplicate) {
        const originalCount = drag.baseline.length;
        drag.baseline = duplicateNotes(drag.baseline, drag.ids, 0);
        drag.ids = drag.baseline.slice(originalCount).map(note => note.id);
        selectIds(new Set(drag.ids));
      }
      drag.moved = true;
      setCursor(drag.kind === "resize" ? "ew-resize" : drag.duplicate ? "copy" : "grabbing");
      const rawDelta = pointerTick - drag.pointerStartTick;
      const deltaTick =
        snapOrNot(drag.anchorTick + rawDelta, bypassSnap) - drag.anchorTick;

      if (drag.kind === "resize") {
        commit(
          resizeNotes(
            drag.baseline,
            drag.ids,
            deltaTick,
            snapEnabled && !bypassSnap ? gridStepTicks : 1
          )
        );
        return;
      }

      let next: MidiNote[];
      let vertical: number;
      if (geo.rows) {
        vertical = rowOf(pointerPitch, geo) - rowOf(drag.pointerStartPitch, geo);
        next = moveNotesByRows(drag.baseline, drag.ids, deltaTick, vertical, geo.rows);
      } else {
        vertical = pointerPitch - drag.pointerStartPitch;
        next = moveNotes(drag.baseline, drag.ids, { deltaTick, deltaPitch: vertical });
      }
      const scale = settingsRef.current.snapToScale ? scaleForQRef.current : null;
      if (scale && vertical !== 0) next = snapMovedToScale(next, new Set(drag.ids), scale);
      commit(next);
      const anchor = next.find((note) => note.id === drag.ids[0]);
      if (anchor) writePosition(anchor.pitch, anchor.startTick);
      if (anchor && anchor.pitch !== drag.lastPitch) {
        drag.lastPitch = anchor.pitch;
        audition(anchor.pitch);
      }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
      if (dragRef.current) handlePointerMove(e);
      const drag = dragRef.current;
      dragRef.current = null;
      hoveringRef.current = false;
      thawRows();
      if (!drag) return;
      if (drag.kind === "marquee") {
        setMarquee(null);
        // A press that never moved is a click on empty space: it clears the
        // selection and writes nothing.
        if (!drag.moved && !drag.additive) selectIds(new Set());
        return;
      }
      if (
        (drag.kind === "move" || drag.kind === "resize") &&
        drag.moved &&
        settingsRef.current.dragMode === "noOverlap"
      ) {
        commit(applyNoOverlap(latestNotes(), drag.ids));
      }
      history.end();
      setCursor(toolCursor("pointer"));
      if (drag.kind === "move" && !drag.moved) audition(drag.lastPitch);
    };

    const handlePointerCancel = (): void => {
      const drag = dragRef.current;
      dragRef.current = null;
      setMarquee(null);
      thawRows();
      if (drag && drag.kind !== "marquee") history.end();
    };

    const handlePointerLeave = (): void => {
      if (dragRef.current) return;
      hoveringRef.current = false;
      showSelectionPosition();
    };

    const handleDoubleClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const { x, y } = localPoint(e);
        const hit = hitTestNote(notesRef.current, x, y, geometryRef.current);
        if (!hit) return;
        const created = createdOnClickRef.current;
        if (created?.id === hit.note.id && e.timeStamp - created.time < 500) return;
        e.preventDefault();
        setClipNotes(clipId, removeNotes(notesRef.current, [hit.note.id]));
        setSelectedIds((prev) => {
          if (!prev.has(hit.note.id)) return prev;
          const next = new Set(prev);
          next.delete(hit.note.id);
          return next;
        });
      },
      [clipId, localPoint, setClipNotes]
    );

    // ── Velocity lane ─────────────────────────────────────────────────────
    const handleVelocityStart = useCallback(() => {
      rootRef.current?.focus();
      velocityBaseline.current = latestNotes();
      history.begin();
    }, [history, latestNotes]);
    const changeRelativeVelocity = useCallback((baseline: readonly MidiNote[], ids: ReadonlySet<string>, delta: number) => {
      const selected = baseline.filter(note => ids.has(note.id));
      const min = selected.reduce((value, note) => Math.min(value, note.velocity), 127);
      const max = selected.reduce((value, note) => Math.max(value, note.velocity), 1);
      const shift = Math.max(1 - min, Math.min(127 - max, Math.round(delta)));
      commit(baseline.map(note => ids.has(note.id) ? {...note, velocity: note.velocity + shift} : note));
    }, [commit]);
    const handleVelocityChange = useCallback(
      (noteId: string, velocity: number) => {
        const baseline = velocityBaseline.current ?? notesRef.current;
        const anchor = baseline.find(note => note.id === noteId);
        if (!anchor) return;
        changeRelativeVelocity(baseline, selectedIdsRef.current.has(noteId) ? selectedIdsRef.current : new Set([noteId]), velocity - anchor.velocity);
      },
      [changeRelativeVelocity]
    );
    const handleVelocityEnd = useCallback(() => {
      velocityBaseline.current = null;
      inspectorVelocityShown.current = null;
      history.end();
    }, [history]);

    // The inspector's Velocity slider: one offset for every selected note.
    const startInspectorVelocity = useCallback(() => {
      velocityBaseline.current = latestNotes();
      history.begin();
      inspectorVelocityShown.current = earliestVelocity(
        velocityBaseline.current ?? [],
        selectedIdsRef.current
      );
    }, [history, latestNotes]);
    const changeInspectorVelocity = useCallback(
      (value: number) => {
        if (!velocityBaseline.current) startInspectorVelocity();
        const shown = inspectorVelocityShown.current;
        if (shown === null || !velocityBaseline.current) return;
        commit(shiftVelocity(velocityBaseline.current, selectedIdsRef.current, value - shown));
      },
      [commit, startInspectorVelocity]
    );

    // ── Wheel ─────────────────────────────────────────────────────────────
    // Registered by hand: React's onWheel is passive, so it cannot suppress
    // the browser's own zoom/back-swipe on the same gesture.
    useEffect(() => {
      const el = gridWrapRef.current;
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
          const nextPxPerTick = Math.min(
            MAX_PX_PER_TICK,
            Math.max(MIN_PX_PER_TICK, geo.pxPerTick * factor)
          );
          setPxPerTick(nextPxPerTick);
          setScrollTick(Math.max(0, anchorTick - cursorX / nextPxPerTick));
          return;
        }
        if (scrollDelta !== 0) {
          event.preventDefault();
          if (playbackApi.getState().isPlaying && settingsRef.current.catchPlayhead) {
            setSettings({ catchPlayhead: false });
          }
          setScrollTick((tick) =>
            Math.max(0, tick + scrollDelta / geometryRef.current.pxPerTick)
          );
          return;
        }
        if (event.deltaY !== 0) {
          event.preventDefault();
          const steps =
            Math.sign(event.deltaY) *
            Math.max(1, Math.round(Math.abs(event.deltaY) / geometryRef.current.rowHeightPx));
          if (geometryRef.current.rows) {
            setTopRow((row) => Math.max(0, row + steps));
          } else {
            setTopPitch((pitch) => clampTopPitch(pitch - steps, size.height, geometryRef.current.rowHeightPx));
          }
        }
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }, [size.height, playbackApi, setSettings]);

    const copySelection = (event: React.ClipboardEvent<HTMLDivElement>, cut: boolean) => {
      if (isNoteControl(event.target)) return;
      const selected = notesRef.current.filter(note => selectedIdsRef.current.has(note.id));
      if (selected.length === 0 || dragRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      event.clipboardData.setData("text/plain", encodeNoteClipboard(selected));
      if (cut) {
        setClipNotes(clipId, removeNotes(notesRef.current, selected.map(note => note.id)));
        setSelectedIds(new Set());
      }
    };

    const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (isNoteControl(event.target) || dragRef.current) return;
      const copied = decodeNoteClipboard(event.clipboardData.getData("text/plain"));
      if (!copied) return;
      event.preventDefault();
      event.stopPropagation();
      const copies = pasteNotes(copied, timelineMsToTick(playbackApi.getState().getTimeMs()));
      setClipNotes(clipId, [...notesRef.current, ...copies]);
      setSelectedIds(new Set(copies.map(note => note.id)));
    };

    // ── Keyboard ──────────────────────────────────────────────────────────
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (isNoteControl(e.target)) return;
        const ctrl = e.ctrlKey || e.metaKey;
        const ids = [...selectedIdsRef.current];
        const current = notesRef.current;
        const handled = (): void => {
          e.preventDefault();
          e.stopPropagation();
        };

        if (ctrl && ["c", "x", "v"].includes(e.key.toLowerCase())) {
          e.stopPropagation();
          return; // Let the browser dispatch its native clipboard event.
        }
        if (e.key === "?") {
          handled();
          setShortcutsOpen(true);
          return;
        }
        if (ctrl && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
          handled();
          if (dragRef.current) return;
          const temporal = timelineTemporalOf(docApi);
          if (e.shiftKey || e.key.toLowerCase() === "y") temporal.redo();
          else temporal.undo();
          return;
        }
        if (e.key === "Escape") {
          handled();
          if (ids.length > 0) {
            setSelectedIds(new Set());
          } else {
            onClose();
          }
          return;
        }
        if (ctrl && e.key.toLowerCase() === "a") {
          handled();
          setSelectedIds(new Set(current.map((note) => note.id)));
          return;
        }
        if (ctrl && ["r", "t", "d"].includes(e.key.toLowerCase())) handled();
        if (dragRef.current) return;

        if (!ctrl && !e.altKey && e.key.toLowerCase() === "q") {
          handled();
          fns.quantize();
          return;
        }
        if (ids.length === 0) return;
        if (!ctrl && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "m") {
          handled();
          // Any unmuted note in the selection: mute them all. Otherwise unmute.
          const selection = selectedIdsRef.current;
          const mute = current.some((note) => selection.has(note.id) && !note.muted);
          setClipNotes(clipId, current.map((note) => {
            if (!selection.has(note.id)) return note;
            if (mute) return { ...note, muted: true };
            const { muted: _unmuted, ...rest } = note;
            void _unmuted;
            return rest;
          }));
          return;
        }
        if (ctrl && e.key.toLowerCase() === "t") {
          handled();
          const tick = Math.round(timelineMsToTick(playbackApi.getState().getTimeMs()));
          const nextIds = new Set<string>();
          const next = current.flatMap(note => {
            if (!selectedIdsRef.current.has(note.id)) return [note];
            nextIds.add(note.id);
            const end = note.startTick + note.durationTick;
            if (tick <= note.startTick || tick >= end) return [note];
            const [left, right] = splitNote(note, tick, createTimeOrderedUuid());
            nextIds.add(right.id);
            return [left, right];
          });
          setClipNotes(clipId, next);
          setSelectedIds(nextIds);
          return;
        }

        if (e.key === "Delete" || e.key === "Backspace") {
          handled();
          setClipNotes(clipId, removeNotes(current, ids));
          setSelectedIds(new Set());
          return;
        }
        if (ctrl && ["d", "r"].includes(e.key.toLowerCase())) {
          handled();
          // A Set, not `ids.includes`: the selection can be the whole clip,
          // and a linear scan per note is O(n²) on a 4096-note part.
          const selectedIdSet = new Set(ids);
          const selected = current.filter((note) => selectedIdSet.has(note.id));
          if (selected.length === 0) return;
          const minStart = Math.min(...selected.map((note) => note.startTick));
          const maxEnd = Math.max(
            ...selected.map((note) => note.startTick + note.durationTick)
          );
          const offset = maxEnd - minStart;
          const next = duplicateNotes(current, ids, offset);
          setClipNotes(clipId, next);
          setSelectedIds(new Set(next.slice(current.length).map((n) => n.id)));
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          handled();
          const increment = (e.altKey && !ctrl) || !snapEnabled ? 1 : gridStepTicks;
          const step = e.key === "ArrowLeft" ? -increment : increment;
          if (e.shiftKey) {
            setClipNotes(clipId, resizeNotes(current, ids, Math.round(step), 1));
            return;
          }
          setClipNotes(
            clipId,
            moveNotes(current, ids, {
              deltaTick: Math.round(step),
              deltaPitch: 0
            })
          );
          return;
        }
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          handled();
          const magnitude = e.shiftKey ? 12 : 1;
          const deltaPitch = e.key === "ArrowUp" ? magnitude : -magnitude;
          const next = moveNotes(current, ids, { deltaTick: 0, deltaPitch });
          setClipNotes(clipId, next);
          const first = next.find((note) => note.id === ids[0]);
          if (first) audition(first.pitch, first.velocity);
        }
      },
      [audition, clipId, docApi, gridPhaseTick, gridStepTicks, onClose, playbackApi, fns, setClipNotes, snapEnabled, timelineMsToTick]
    );

    const selectedNotes = notes.filter(note => selectedIds.has(note.id));
    // ── Lanes under the grid ──────────────────────────────────────────────
    const [laneValue, setLaneValue] = useState<LaneValue>("velocity");
    const [otherCc, setOtherCc] = useState(2);
    const singleNote = selectedNotes.length === 1 ? selectedNotes[0] : null;
    const singleNoteId = singleNote?.id;
    const expressionKind = laneExpressionKind(laneValue);
    // An expression lane needs exactly one selected note; without one the
    // lane falls back to the velocity bars.
    const activeLane: LaneValue =
      expressionKind !== null && !singleNote ? "velocity" : laneValue;
    const activeTarget = useMemo(() => laneTarget(activeLane, otherCc), [activeLane, otherCc]);
    const activeExpression = laneExpressionKind(activeLane);
    const controllers = clip?.controllers;

    const laneCurve = useMemo((): LaneCurve | null => {
      if (activeTarget) {
        const lane = findControllerLane(controllers ?? [], activeTarget);
        const bend = activeTarget.kind === "pitchBend";
        return {
          points: lane?.points ?? [],
          min: bend ? -8192 : 0,
          max: bend ? 8191 : 127,
          neutral: null,
          integer: true,
          step: lane?.interpolation === "step",
          originTick: 0,
          maxTick: null
        };
      }
      if (activeExpression && singleNote) {
        const range = expressionCurveRange(activeExpression);
        return {
          points: (singleNote.expression?.[activeExpression] ?? []).map(
            (p, i) => ({ id: `${singleNote.id}:${i}`, tick: p.tick, value: p.value })
          ),
          min: range.min,
          max: range.max,
          neutral: range.neutral,
          integer: false,
          step: false,
          originTick: singleNote.startTick,
          maxTick: singleNote.durationTick
        };
      }
      return null;
    }, [activeTarget, activeExpression, controllers, singleNote]);

    const handleLaneChange = useCallback(
      (points: CurvePoint[]) => {
        const stored = findClipById(docApi.getState().clips, clipId);
        if (!stored) return;
        if (activeTarget) {
          setClipControllers(
            clipId,
            setLanePoints(stored.controllers ?? [], activeTarget, points)
          );
        } else if (activeExpression && singleNoteId) {
          const base = (stored.notes ?? []).find((n) => n.id === singleNoteId);
          if (!base) return;
          const updated = setExpressionPoints(base, activeExpression, points);
          setClipNotes(
            clipId,
            (stored.notes ?? []).map((n) => (n.id === base.id ? updated : n))
          );
        }
        history.mark();
      },
      [activeExpression, activeTarget, clipId, docApi, history, setClipControllers, setClipNotes, singleNoteId]
    );
    const handleLaneGestureStart = useCallback(() => history.begin(), [history]);
    const handleLaneGestureEnd = useCallback(() => history.end(), [history]);
    const toggleLaneStep = useCallback(() => {
      if (!activeTarget) return;
      const stored = findClipById(docApi.getState().clips, clipId);
      const lane = findControllerLane(stored?.controllers ?? [], activeTarget);
      if (!stored || !lane) return;
      setClipControllers(
        clipId,
        (stored.controllers ?? []).map((l) =>
          l === lane
            ? { ...l, interpolation: l.interpolation === "step" ? "linear" : "step" }
            : l
        )
      );
    }, [activeTarget, clipId, docApi, setClipControllers]);

    const laneOptions = useMemo(() => {
      const label = (value: LaneValue) => t(`pass3_20.pianoRoll.lanes.options.${value.replace(":", "_")}`);
      const values: LaneValue[] = [
        "velocity",
        ...CONTROLLER_LANE_VALUES,
        ...(singleNote ? EXPRESSION_LANE_VALUES : [])
      ];
      return values.map((value) => ({ value, label: label(value) }));
    }, [singleNote, t]);

    // ── Zoom, Zoom to Fit, Catch ──────────────────────────────────────────
    const hZoom = Math.min(
      1,
      Math.max(0, Math.log(pxPerTick / MIN_PX_PER_TICK) / Math.log(MAX_PX_PER_TICK / MIN_PX_PER_TICK))
    );
    const handleHZoom = useCallback((position: number) => {
      const geo = geometryRef.current;
      const centerX = size.width / 2;
      const anchorTick = xToTick(centerX, geo);
      const next = MIN_PX_PER_TICK * Math.pow(MAX_PX_PER_TICK / MIN_PX_PER_TICK, position);
      setPxPerTick(next);
      setScrollTick(Math.max(0, anchorTick - centerX / next));
    }, [size.width]);
    const handleZoomToFit = useCallback(() => {
      const current = notesRef.current;
      if (current.length === 0 || size.width <= 0) return;
      const from = Math.min(...current.map((n) => n.startTick));
      const to = Math.max(...current.map((n) => n.startTick + n.durationTick));
      const span = Math.max(1, (to - from) * FIT_MARGIN);
      const next = Math.min(MAX_PX_PER_TICK, Math.max(MIN_PX_PER_TICK, size.width / span));
      setPxPerTick(next);
      setScrollTick(Math.max(0, from - (span - (to - from)) / 2));
      setTopPitch(initialTopPitch(current, size.height / rowHeightPx));
      setTopRow(0);
    }, [size.width, size.height, rowHeightPx]);

    useEffect(() => {
      if (!settings.catchPlayhead) return;
      return playbackApi.getState().subscribeTime((ms) => {
        if (!playbackApi.getState().isPlaying) return;
        const tick = timelineMsToTick(ms);
        const geo = geometryRef.current;
        const last = xToTick(size.width, geo);
        if (tick >= geo.scrollTick && tick <= last) return;
        setScrollTick(Math.max(0, tick - (last - geo.scrollTick) * CATCH_PLAYHEAD_FRACTION));
      });
    }, [settings.catchPlayhead, playbackApi, timelineMsToTick, size.width]);

    const handleUndo = useCallback(() => timelineTemporalOf(docApi).undo(), [docApi]);
    const handleRedo = useCallback(() => timelineTemporalOf(docApi).redo(), [docApi]);
    const handleShortcuts = useCallback(() => setShortcutsOpen(true), []);
    const handleScale = useCallback(
      (patch: { scaleRoot?: number; scaleId?: string }) => setSettings(patch),
      [setSettings]
    );
    const handleQuantizeValue = useCallback(
      (value: QuantizeDivision) => {
        useTimelineUIStore.getState().setQuantizeSettings({ value });
        if (selectedIdsRef.current.size > 0) fns.quantize({ value });
      },
      [fns]
    );
    const quantizeSettings = useTimelineUIStore((s) => s.quantizeSettings);
    const setQuantizeSettings = useTimelineUIStore((s) => s.setQuantizeSettings);

    if (!clip) return null;

    const inspectorVisible = settings.inspector ?? !compact;
    const clipColor = (clip as { color?: string }).color;

    return (
      <FlexColumn
        ref={rootRef}
        data-timeline-piano-roll
        data-testid="piano-roll"
        tabIndex={0}
        role="application"
        aria-label={t("pass3_20.pianoRoll.accessibility.noteEditor", {
          name: clip.name || t("pass3_20.pianoRoll.labels.midiClip")
        })}
        onKeyDown={handleKeyDown}
        onCopy={event => copySelection(event, false)}
        onCut={event => copySelection(event, true)}
        onPaste={handlePaste}
        css={rootStyles(theme)}
        fullWidth
        sx={{ flex: 1, minHeight: 0 }}
      >
        <PianoRollToolbar
          mac={mac}
          hasSelection={selectedNotes.length > 0}
          hasNotes={notes.length > 0}
          scaleReady={scaleForQ !== null}
          settings={settings}
          setSettings={setSettings}
          fns={fns}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onZoomToFit={handleZoomToFit}
          onShortcuts={handleShortcuts}
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
        <Dialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title={t("pass3_20.pianoRoll.shortcuts.title")}>
          <FlexColumn gap={SPACING.sm}>
            {[
              "copyCutPaste", "repeat", "quantize", "muteNotes", "transposeSemitone",
              "transposeOctave", "nudgeGrid", "nudgeTick", "resizeGrid",
              "splitAtPlayhead", "selectAllDelete", "undoRedo", "toggleOrMarquee",
              "duplicateOrBypassSnap", "noteFields", "windowsControl"
            ].map((shortcut) => <Caption key={shortcut}>{t(`pass3_20.pianoRoll.shortcuts.${shortcut}`)}</Caption>)}
          </FlexColumn>
        </Dialog>
        <FlexRow fullWidth sx={{ flex: 1, minHeight: 0 }}>
          {inspectorVisible && (
            <PianoRollInspector
              clipName={clip.name || t("pass3_20.pianoRoll.labels.midiClip")}
              trackName={trackName}
              clipColor={clipColor}
              notes={notes}
              selectedIds={selectedIds}
              beatTicks={beatTicks}
              onNotesChange={write}
              quantize={quantizeSettings}
              onQuantizeSettings={setQuantizeSettings}
              onQuantizeValue={handleQuantizeValue}
              onQuantize={() => fns.quantize()}
              scaleRoot={scaleRoot}
              scaleId={settings.scaleId}
              onScale={handleScale}
              onScaleQuantize={fns.scaleQuantize}
              snapToScale={settings.snapToScale}
              onSnapToScale={(snapToScale) => setSettings({ snapToScale })}
              velocity={earliestVelocity(notes, selectedIds)}
              onVelocityStart={startInspectorVelocity}
              onVelocityChange={changeInspectorVelocity}
              onVelocityEnd={handleVelocityEnd}
            />
          )}
          <FlexColumn sx={{ width: KEYBOARD_WIDTH_PX, flexShrink: 0 }}>
            <div style={{ height: PIANO_ROLL_RULER_HEIGHT_PX + REGION_STRIP_HEIGHT_PX }} />
            <PianoRollKeyboard
              geometry={geometry}
              heightPx={size.height}
              instrument={instrument}
            />
            {settings.midiDraw && <div style={{ height: LANE_HEADER_HEIGHT_PX + VELOCITY_LANE_HEIGHT_PX }} />}
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
              name={clip.name || t("pass3_20.pianoRoll.labels.midiClip")}
              clipColor={clipColor}
            />
            <div
              ref={gridWrapRef}
              css={gridWrapStyles}
              style={{ cursor }}
              data-testid="piano-roll-grid"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onPointerLeave={handlePointerLeave}
              onDoubleClick={handleDoubleClick}
            >
              <PianoRollGrid
                geometry={geometry}
                widthPx={size.width}
                heightPx={size.height}
                notes={notes}
                ghostNotes={ghostNotes}
                selectedIds={selectedIds}
                beatTicks={beatLines}
                stepTicks={stepLines}
                noteColorMode={settings.noteColor}
                clipColor={clipColor}
                barTicks={barTicks}
                windowFromTick={windowFromTick}
                windowToTick={windowToTick}
                marquee={marquee}
              />
              <div ref={playheadRef} css={playheadStyles(theme)} aria-hidden />
            </div>
            {settings.midiDraw && (<>
            <FlexRow
              align="center"
              gap={SPACING.sm}
              sx={{ height: LANE_HEADER_HEIGHT_PX, flexShrink: 0, overflow: "hidden" }}
            >
              <SelectField
                label={t("pass3_20.pianoRoll.lanes.label")}
                hideLabel
                size="small"
                value={activeLane}
                options={laneOptions}
                css={css({ width: 168 })}
                onChange={(value) => setLaneValue(value as LaneValue)}
              />
              {activeLane === "otherCc" && (
                <TextInput
                  label={t("pass3_20.pianoRoll.lanes.ccNumber")}
                  hideLabel
                  type="number"
                  compact
                  fullWidth={false}
                  sx={{ width: 76 }}
                  value={otherCc}
                  inputProps={{ min: 0, max: 127, step: 1 }}
                  onChange={(event) => {
                    const next = Math.round(Number(event.target.value));
                    if (Number.isFinite(next)) setOtherCc(Math.min(127, Math.max(0, next)));
                  }}
                />
              )}
              {activeTarget && (
                <EditorButton
                  variant={laneCurve?.step ? "contained" : "text"}
                  aria-pressed={Boolean(laneCurve?.step)}
                  disabled={(laneCurve?.points.length ?? 0) === 0}
                  onClick={toggleLaneStep}
                >
                  {t("pass3_20.pianoRoll.lanes.step")}
                </EditorButton>
              )}
            </FlexRow>
            {laneCurve ? (
              <PianoRollCurveLane
                key={`${activeLane}:${singleNoteId ?? ""}`}
                curve={laneCurve}
                geometry={geometry}
                widthPx={size.width}
                gridStepTicks={gridStepTicks}
                gridPhaseTick={gridPhaseTick}
                snapEnabled={snapEnabled}
                windowFromTick={windowFromTick}
                windowToTick={windowToTick}
                extent={
                  activeExpression && singleNote
                    ? { startTick: singleNote.startTick, endTick: singleNote.startTick + singleNote.durationTick }
                    : undefined
                }
                ariaLabel={t("pass3_20.pianoRoll.lanes.aria", {
                  name: laneOptions.find((o) => o.value === activeLane)?.label ?? ""
                })}
                onGestureStart={handleLaneGestureStart}
                onGestureEnd={handleLaneGestureEnd}
                onChange={handleLaneChange}
              />
            ) : (
              <PianoRollVelocityLane
                notes={notes}
                selectedIds={selectedIds}
                geometry={geometry}
                widthPx={size.width}
                onGestureStart={handleVelocityStart}
                onVelocityChange={handleVelocityChange}
                onGestureEnd={handleVelocityEnd}
              />
            )}
            </>)}
          </FlexColumn>
        </FlexRow>
      </FlexColumn>
    );
  }
);

PianoRoll.displayName = "PianoRoll";

/** Keep the view inside the 128 pitches there are rows for. */
function clampTopPitch(pitch: number, heightPx: number, rowHeightPx: number): number {
  const rows = Math.max(1, Math.floor(heightPx / rowHeightPx));
  return Math.min(127, Math.max(Math.min(127, rows - 1), pitch));
}

/** The ids a marquee covers. */
function notesInRectIds(
  notes: ReadonlyArray<MidiNote>,
  rect: NoteRect
): string[] {
  return notesInRect(notes, rect).map((note) => note.id);
}
