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
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  addNote,
  createTimeOrderedUuid,
  barDurationMs,
  beatDurationMs,
  divisionToTicks,
  duplicateNotes,
  moveNotes,
  msToTicks,
  notesInRect,
  removeNotes,
  resizeNotes,
  resolveTempo,
  snapTick,
  ticksToMs
} from "@nodetool-ai/timeline";
import type {
  MidiNote,
  NoteRect,
  TempoGridDivision,
  TimelineTempo
} from "@nodetool-ai/timeline";

import { useTimelineStore, useTimelineStoreApi, timelineTemporalOf } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStoreApi } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { Button, Caption, Dialog, FlexColumn, FlexRow, Slider, SPACING } from "../../ui_primitives";
import { playAuditionNote } from "../preview/audition";
import { partitionTimelineWheel } from "../Tracks/timelineWheel";
import { visibleTempoGrid } from "../Tracks/tempoGrid";
import { PianoRollGrid } from "./PianoRollGrid";
import { PianoRollKeyboard, KEYBOARD_WIDTH_PX } from "./PianoRollKeyboard";
import {
  PianoRollRuler,
  PIANO_ROLL_RULER_HEIGHT_PX
} from "./PianoRollRuler";
import {
  PianoRollVelocityLane,
  VELOCITY_LANE_HEIGHT_PX
} from "./PianoRollVelocityLane";
import {
  hitTestNote,
  pitchName,
  initialTopPitch,
  tickToX,
  xToTick,
  yToPitch,
  type NoteHitEdge,
  type PianoRollGeometry
} from "./pianoRollGeometry";

import { decodeNoteClipboard, encodeNoteClipboard, pasteNotes } from "./noteClipboard";
import { NoteSelectionInspector } from "./NoteSelectionInspector";

const isNoteControl = (target: EventTarget) => target instanceof HTMLElement &&
  target.closest("input, select, textarea, button, [role=combobox], [role=dialog], [contenteditable=true]") !== null;

/** Height of one semitone row. */
const ROW_HEIGHT_PX = 16;
/** Zoom bounds, in pixels per tick. */
const MIN_PX_PER_TICK = 0.002;
const MAX_PX_PER_TICK = 1;
/** One wheel notch's zoom factor, matching the tracks region's feel. */
const ZOOM_STEP = 1.15;
/** How far a pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 3;

const rootStyles = (theme: Theme) =>
  css({
    width: "100%",
    minHeight: 0,
    backgroundColor: theme.vars.palette.background.default,
    borderTop: `1px solid ${theme.vars.palette.divider}`,
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
}

export const PianoRoll: React.FC<PianoRollProps> = memo(
  ({ clipId, onClose }) => {
    const theme = useTheme();
    const clip = useTimelineStore((s) => findClipById(s.clips, clipId));
    const tempo = useTimelineStore((s) => resolveTempo(s));
    const setClipNotes = useTimelineStore((s) => s.setClipNotes);
    const trackId = clip?.trackId;
    const instrument = useTimelineStore(
      (s) => s.tracks.find((t) => t.id === trackId)?.instrument
    );
    const gridDivision = useTimelineUIStore((s) => s.gridDivision);
    const snapEnabled = useTimelineUIStore((s) => s.snapEnabled);
    const docApi = useTimelineStoreApi();
    const playbackApi = useTimelinePlaybackStoreApi();
    const history = useTimelineHistoryBatch();

    const notes = useMemo(() => clip?.notes ?? [], [clip?.notes]);
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
    const [marquee, setMarquee] = useState<NoteRect | null>(null);

    const gridWrapRef = useRef<HTMLDivElement | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const playheadRef = useRef<HTMLDivElement | null>(null);
    const createdOnClickRef = useRef<{ id: string; time: number } | null>(null);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [cursor, setCursor] = useState("crosshair");
    const dragRef = useRef<GridDrag | null>(null);
    const velocityBaseline = useRef<readonly MidiNote[] | null>(null);

    const geometry: PianoRollGeometry = useMemo(
      () => ({ pxPerTick, scrollTick, rowHeightPx: ROW_HEIGHT_PX, topPitch }),
      [pxPerTick, scrollTick, topPitch]
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

    const gridStepTicks = useMemo(
      () => gridDivisionTicks(gridDivision, tempo),
      [gridDivision, tempo]
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
        initialTopPitch(notesRef.current, size.height / ROW_HEIGHT_PX)
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
    const { gridTicks, barTicks } = useMemo(() => {
      if (size.width <= 0) return { gridTicks: [], barTicks: [] };
      const fromMs = Math.max(0, tickToTimelineMs(xToTick(0, geometry)));
      const toMs = tickToTimelineMs(xToTick(size.width, geometry));
      if (!(toMs > fromMs)) return { gridTicks: [], barTicks: [] };
      const spec = { tempo, fromMs, toMs };
      return {
        gridTicks: visibleTempoGrid({ ...spec, division: gridDivision }).map(
          timelineMsToTick
        ),
        barTicks: visibleTempoGrid({ ...spec, division: "bar" }).map(
          timelineMsToTick
        )
      };
    }, [
      size.width,
      geometry,
      tempo,
      gridDivision,
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
        if (!instrument) return;
        void playAuditionNote(instrument, pitch, velocity).catch(() => undefined);
      },
      [instrument]
    );

    /** The tick a pointer means, snapped unless the caller bypasses the grid. */
    const snapOrNot = useCallback(
      (tick: number, bypass: boolean) =>
        bypass || !snapEnabled ? Math.round(tick) : snapTick(tick, gridStepTicks),
      [gridStepTicks, snapEnabled]
    );

    // ── Pointer gestures ──────────────────────────────────────────────────
    const localPoint = useCallback(
      (e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
      },
      []
    );

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        rootRef.current?.focus();
        const { x, y } = localPoint(e);
        const geo = geometryRef.current;
        const hit = hitTestNote(notesRef.current, x, y, geo);
        const pointerTick = xToTick(x, geo);
        const pointerPitch = yToPitch(y, geo);

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
            setSelectedIds(next);
            selectedIdsRef.current = next;
            // A shift-click toggles membership; it does not start a drag.
            return;
          }
          if (selectedIdsRef.current.has(hit.note.id)) {
            ids = [...selectedIdsRef.current];
          } else {
            ids = [hit.note.id];
            const next = new Set(ids);
            setSelectedIds(next);
            selectedIdsRef.current = next;
          }
          const edge: NoteHitEdge = hit.edge;
          dragRef.current = {
            kind: edge === "end" ? "resize" : "move",
            ids,
            baseline: [...notesRef.current],
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
        if (typeof e.currentTarget.setPointerCapture === "function") {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // No capture available: the gesture still runs inside the panel.
          }
        }
      },
      [history, localPoint]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        const { x, y } = localPoint(e);
        if (!drag) {
          const hit = hitTestNote(notesRef.current, x, y, geometryRef.current);
          setCursor(hit ? hit.edge === "end" ? "ew-resize" : e.altKey ? "copy" : "grab" : "crosshair");
          return;
        }
        if (!drag.moved && Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD_PX &&
            Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD_PX) return;
        const geo = geometryRef.current;
        const pointerTick = xToTick(x, geo);
        const pointerPitch = yToPitch(y, geo);
        const bypassSnap = e.metaKey || e.ctrlKey;

        if (drag.kind === "marquee") {
          drag.moved = true;
          const rect: NoteRect = {
            fromTick: drag.startTick,
            toTick: pointerTick,
            minPitch: drag.startPitch,
            maxPitch: pointerPitch
          };
          setMarquee(rect);
          setSelectedIds(
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
          const selection = new Set(drag.ids);
          selectedIdsRef.current = selection;
          setSelectedIds(selection);
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

        const deltaPitch = pointerPitch - drag.pointerStartPitch;
        const next = moveNotes(drag.baseline, drag.ids, {
          deltaTick,
          deltaPitch
        });
        commit(next);
        const anchorPitch = next.find((note) => note.id === drag.ids[0])?.pitch;
        if (anchorPitch !== undefined && anchorPitch !== drag.lastPitch) {
          drag.lastPitch = anchorPitch;
          audition(anchorPitch);
        }
      },
      [audition, commit, gridStepTicks, localPoint, snapEnabled, snapOrNot]
    );

    const handlePointerUp = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (dragRef.current) handlePointerMove(e);
        const drag = dragRef.current;
        dragRef.current = null;
        if (!drag) return;
        if (drag.kind === "marquee") {
          setMarquee(null);
          if (drag.moved) return;
          if (drag.additive) return;
          // A press that never moved is a click on empty space: write a note
          // one grid unit long where it landed.
          const { x, y } = localPoint(e);
          const geo = geometryRef.current;
          const pitch = yToPitch(y, geo);
          if (pitch < 0 || pitch > 127) {
            setSelectedIds(new Set());
            return;
          }
          const rawTick = xToTick(x, geo);
          const startTick = snapEnabled && !e.metaKey && !e.ctrlKey
            ? Math.floor(rawTick / gridStepTicks) * gridStepTicks
            : Math.round(rawTick);
          const created = addNote(notesRef.current, {
            pitch,
            startTick,
            durationTick: Math.max(1, Math.round(gridStepTicks))
          });
          setClipNotes(clipId, created);
          const newest = created[created.length - 1];
          if (newest) {
            createdOnClickRef.current = { id: newest.id, time: e.timeStamp };
            setSelectedIds(new Set([newest.id]));
            audition(pitch, newest.velocity);
          }
          return;
        }
        history.end();
        setCursor("grab");
        if (!drag.moved && drag.kind === "move") audition(drag.lastPitch);
      },
      [
        audition,
        clipId,
        gridStepTicks,
        history,
        handlePointerMove,
        localPoint,
        setClipNotes,
        snapEnabled
      ]
    );

    const handlePointerCancel = useCallback(() => {
      const drag = dragRef.current;
      dragRef.current = null;
      setMarquee(null);
      if (drag && drag.kind !== "marquee") history.end();
    }, [history]);

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
      velocityBaseline.current = notesRef.current;
      history.begin();
    }, [history]);
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
      history.end();
    }, [history]);

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
          setScrollTick((tick) =>
            Math.max(0, tick + scrollDelta / geometryRef.current.pxPerTick)
          );
          return;
        }
        if (event.deltaY !== 0) {
          event.preventDefault();
          const rows =
            Math.sign(event.deltaY) *
            Math.max(1, Math.round(Math.abs(event.deltaY) / ROW_HEIGHT_PX));
          setTopPitch((pitch) => clampTopPitch(pitch - rows, size.height));
        }
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }, [size.height]);

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
        if (dragRef.current || ids.length === 0) return;

        if (!ctrl && !e.altKey && e.key.toLowerCase() === "q") {
          handled();
          setClipNotes(clipId, current.map(note => selectedIdsRef.current.has(note.id)
            ? { ...note, startTick: snapTick(note.startTick, gridStepTicks) }
            : note));
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
            const right = { ...note, id: createTimeOrderedUuid(), startTick: tick, durationTick: end - tick };
            nextIds.add(right.id);
            return [{ ...note, durationTick: tick - note.startTick }, right];
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
      [audition, clipId, docApi, gridStepTicks, onClose, playbackApi, setClipNotes, snapEnabled, timelineMsToTick]
    );

    const selectedNotes = notes.filter(note => selectedIds.has(note.id));
    const selectedVelocity = selectedNotes.length
      ? Math.round(selectedNotes.reduce((sum, note) => sum + note.velocity, 0) / selectedNotes.length)
      : 100;
    if (!clip) return null;

    return (
      <FlexColumn
        ref={rootRef}
        data-timeline-piano-roll
        data-testid="piano-roll"
        tabIndex={0}
        role="application"
        aria-label={`Note editor for ${clip.name || "midi clip"}`}
        onKeyDown={handleKeyDown}
        onCopy={event => copySelection(event, false)}
        onCut={event => copySelection(event, true)}
        onPaste={handlePaste}
        css={rootStyles(theme)}
        fullWidth
        sx={{ flex: 1, minHeight: 0 }}
      >
        <FlexRow gap={SPACING.md} sx={{ px: SPACING.sm, py: SPACING.xs, flexShrink: 0, flexWrap: "wrap" }}>
          <Caption aria-live="polite">
            {selectedNotes.map(note => `${pitchName(note.pitch)} · velocity ${note.velocity}`).slice(0, 1).join("") || "Click to add a note"}
            {selectedNotes.length > 1 ? ` · ${selectedNotes.length} selected` : ""}
          </Caption>
          <Caption color="muted">Velocity ±</Caption>
          <Slider aria-label="Selected note velocity" min={1} max={127} step={1}
            density="compact" sx={{ width: 96 }} disabled={selectedNotes.length === 0}
            value={selectedVelocity} valueLabelDisplay="auto"
            onPointerDown={handleVelocityStart}
            onChange={(_, value) => {
              const baseline = velocityBaseline.current ?? notesRef.current;
              const selected = baseline.filter(note => selectedIdsRef.current.has(note.id));
              const mean = selected.reduce((sum, note) => sum + note.velocity, 0) / selected.length;
              changeRelativeVelocity(baseline, selectedIdsRef.current, (value as number) - Math.round(mean));
            }}
            onChangeCommitted={handleVelocityEnd} onPointerCancel={handleVelocityEnd} />
          <Caption color="muted">⌘C/V copy/paste · ⌘R repeat · Q quantize</Caption>
          <Button size="small" variant="text" onClick={() => setShortcutsOpen(true)} aria-label="Note editing shortcuts">Shortcuts</Button>
        </FlexRow>
        <NoteSelectionInspector notes={notes} selectedIds={selectedIds}
          beatTicks={msToTicks(beatDurationMs(tempo), tempo.bpm)}
          onChange={next => setClipNotes(clipId, next)} />
        <Dialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Note editing shortcuts">
          <FlexColumn gap={SPACING.sm}>
            {[
              "⌘C / ⌘X / ⌘V — Copy / cut / paste at the playhead",
              "⌘R — Repeat selection immediately after its end",
              "Q — Quantize note starts to the Note grid",
              "⌥↑ / ⌥↓ — Transpose one semitone",
              "⇧⌥↑ / ⇧⌥↓ — Transpose one octave",
              "⌃⌥← / ⌃⌥→ — Nudge by the Note grid",
              "⇧← / ⇧→ — Shorten / lengthen by the Note grid",
              "⌘T — Split selected notes at the playhead",
              "⌘A — Select all notes · Delete — Delete selection",
              "⌘Z / ⇧⌘Z — Undo / redo",
              "Shift-click — Toggle selection · Drag empty space — Select notes",
              "Option-drag — Duplicate selection · ⌘/Ctrl-drag — Bypass snapping",
              "Ctrl substitutes for ⌘ on Windows. Existing arrow and ⌘D shortcuts also work."
            ].map(shortcut => <Caption key={shortcut}>{shortcut}</Caption>)}
          </FlexColumn>
        </Dialog>
        <FlexRow fullWidth sx={{ flex: 1, minHeight: 0 }}>
          <FlexColumn sx={{ width: KEYBOARD_WIDTH_PX, flexShrink: 0 }}>
            <div style={{ height: PIANO_ROLL_RULER_HEIGHT_PX }} />
            <PianoRollKeyboard
              geometry={geometry}
              heightPx={size.height}
              instrument={instrument}
            />
            <div style={{ height: VELOCITY_LANE_HEIGHT_PX }} />
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
            <div
              ref={gridWrapRef}
              css={gridWrapStyles}
              style={{ cursor }}
              data-testid="piano-roll-grid"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onDoubleClick={handleDoubleClick}
            >
              <PianoRollGrid
                geometry={geometry}
                widthPx={size.width}
                heightPx={size.height}
                notes={notes}
                selectedIds={selectedIds}
                gridTicks={gridTicks}
                barTicks={barTicks}
                windowFromTick={windowFromTick}
                windowToTick={windowToTick}
                marquee={marquee}
              />
              <div ref={playheadRef} css={playheadStyles(theme)} aria-hidden />
            </div>
            <PianoRollVelocityLane
              notes={notes}
              selectedIds={selectedIds}
              geometry={geometry}
              widthPx={size.width}
              onGestureStart={handleVelocityStart}
              onVelocityChange={handleVelocityChange}
              onGestureEnd={handleVelocityEnd}
            />
          </FlexColumn>
        </FlexRow>
      </FlexColumn>
    );
  }
);

PianoRoll.displayName = "PianoRoll";

/** Keep the view inside the 128 pitches there are rows for. */
function clampTopPitch(pitch: number, heightPx: number): number {
  const rows = Math.max(1, Math.floor(heightPx / ROW_HEIGHT_PX));
  return Math.min(127, Math.max(Math.min(127, rows - 1), pitch));
}

/** The ids a marquee covers. */
function notesInRectIds(
  notes: ReadonlyArray<MidiNote>,
  rect: NoteRect
): string[] {
  return notesInRect(notes, rect).map((note) => note.id);
}
