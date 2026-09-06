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
  setVelocity,
  snapTick,
  ticksToMs
} from "@nodetool-ai/timeline";
import type {
  MidiNote,
  NoteRect,
  TempoGridDivision,
  TimelineTempo
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelinePlaybackStoreApi } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineHistoryBatch } from "../../../stores/timeline/useTimelineHistoryBatch";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { FlexColumn, FlexRow } from "../../ui_primitives";
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
  initialTopPitch,
  tickToX,
  xToTick,
  yToPitch,
  type NoteHitEdge,
  type PianoRollGeometry
} from "./pianoRollGeometry";

/** Height of one semitone row. */
const ROW_HEIGHT_PX = 12;
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
    }
  | {
      kind: "marquee";
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
    const dragRef = useRef<GridDrag | null>(null);

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
        void playAuditionNote(instrument, pitch, velocity);
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
            lastPitch: hit.note.pitch
          };
          history.begin();
        } else {
          dragRef.current = {
            kind: "marquee",
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
        if (!drag) return;
        const { x, y } = localPoint(e);
        const geo = geometryRef.current;
        const pointerTick = xToTick(x, geo);
        const pointerPitch = yToPitch(y, geo);
        const bypassSnap = e.altKey;

        if (drag.kind === "marquee") {
          if (
            !drag.moved &&
            Math.abs(e.clientX - drag.startX) < DRAG_THRESHOLD_PX &&
            Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD_PX
          ) {
            return;
          }
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
              notesInRectIds(notesRef.current, rect)
            )
          );
          return;
        }

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
        const drag = dragRef.current;
        dragRef.current = null;
        if (!drag) return;
        if (drag.kind === "marquee") {
          setMarquee(null);
          if (drag.moved) return;
          // A press that never moved is a click on empty space: write a note
          // one grid unit long where it landed.
          const { x, y } = localPoint(e);
          const geo = geometryRef.current;
          const pitch = yToPitch(y, geo);
          if (pitch < 0 || pitch > 127) {
            setSelectedIds(new Set());
            return;
          }
          const startTick = snapOrNot(xToTick(x, geo), e.altKey);
          const created = addNote(notesRef.current, {
            pitch,
            startTick,
            durationTick: Math.max(1, Math.round(gridStepTicks))
          });
          setClipNotes(clipId, created);
          const newest = created[created.length - 1];
          if (newest) {
            setSelectedIds(new Set([newest.id]));
            audition(pitch, newest.velocity);
          }
          return;
        }
        history.end();
      },
      [
        audition,
        clipId,
        gridStepTicks,
        history,
        localPoint,
        setClipNotes,
        snapOrNot
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
    const handleVelocityStart = useCallback(() => history.begin(), [history]);
    const handleVelocityChange = useCallback(
      (noteId: string, velocity: number) =>
        commit(setVelocity(notesRef.current, [noteId], velocity)),
      [commit]
    );
    const handleVelocityEnd = useCallback(() => history.end(), [history]);

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

    // ── Keyboard ──────────────────────────────────────────────────────────
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        const ctrl = e.ctrlKey || e.metaKey;
        const ids = [...selectedIdsRef.current];
        const current = notesRef.current;
        const handled = (): void => {
          e.preventDefault();
          e.stopPropagation();
        };

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
        if (ids.length === 0) return;

        if (e.key === "Delete" || e.key === "Backspace") {
          handled();
          setClipNotes(clipId, removeNotes(current, ids));
          setSelectedIds(new Set());
          return;
        }
        if (ctrl && e.key.toLowerCase() === "d") {
          handled();
          // A Set, not `ids.includes`: the selection can be the whole clip,
          // and a linear scan per note is O(n²) on a 4096-note part.
          const selectedIdSet = new Set(ids);
          const selected = current.filter((note) => selectedIdSet.has(note.id));
          const minStart = Math.min(...selected.map((note) => note.startTick));
          const maxEnd = Math.max(
            ...selected.map((note) => note.startTick + note.durationTick)
          );
          const offset = maxEnd + gridStepTicks - minStart;
          const next = duplicateNotes(current, ids, offset);
          setClipNotes(clipId, next);
          setSelectedIds(new Set(next.slice(current.length).map((n) => n.id)));
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          handled();
          const step = e.key === "ArrowLeft" ? -gridStepTicks : gridStepTicks;
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
      [audition, clipId, gridStepTicks, onClose, setClipNotes]
    );

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
        css={rootStyles(theme)}
        fullWidth
        sx={{ flex: 1, minHeight: 0 }}
      >
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
            />
            <div
              ref={gridWrapRef}
              css={gridWrapStyles}
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
