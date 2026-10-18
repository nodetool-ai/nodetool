/**
 * The chord regions of a chord track drawn on the timeline: FableSynth's
 * chord track (src/components/panels/ChordTrack.tsx) laid over the timeline's
 * beat grid instead of a 1-4 bar loop.
 *
 * Click an empty spot to add a chord there (snapped to the lane grid), drag
 * across empty space to draw one, drag a chord to move it, drag its edges to
 * resize it, double-click it to edit root, quality and inversion, and press
 * Delete to remove it. The progression button fills the visible bars.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  chordName,
  createTimeOrderedUuid,
  placeChord,
  resolveTempo,
  sortChords
} from "@nodetool-ai/timeline";
import type { TimelineChord, TimelineTrack } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import { Popover } from "../../../ui_primitives";
import { ChordEditor } from "./ChordEditor";
import {
  barTicks,
  beatTicks,
  chordHue,
  docTickToMs,
  msToDocTick,
  snapDown,
  snapNearest,
  snapTicks
} from "./chordGrid";
import { useHarmonyUIStore, type ChordSnap } from "./harmonyUIStore";
import { ProgressionBrowser } from "./ProgressionBrowser";
import { fillProgression } from "./progressionFill";
import "./harmony.css";

type Drag =
  | { mode: "draw"; fromTick: number; startX: number; moved: boolean }
  | { mode: "move" | "left" | "right"; orig: TimelineChord; grabTick: number; startX: number; moved: boolean };

/** Pointer travel before a press becomes a drag. */
const DRAG_SLOP_PX = 3;
const DOUBLE_TAP_MS = 400;
/** The densest beat grid drawn, in px between lines. */
const MIN_GRID_PX = 6;

export interface ChordLaneBodyProps {
  track: TimelineTrack;
  msPerPx: number;
}

export function ChordLaneBody({ track, msPerPx }: ChordLaneBodyProps): React.JSX.Element {
  const tempoState = useTimelineStore((s) => s.tempo);
  const setTrackChords = useTimelineStore((s) => s.setTrackChords);
  const tempo = useMemo(() => resolveTempo({ tempo: tempoState }), [tempoState]);
  const scrollLeftPx = useTimelineUIStore((s) => s.scrollLeftPx);
  const viewportPx = useTimelineUIStore((s) => s.lanesViewportWidthPx) || 1200;
  const selected = useHarmonyUIStore((s) => s.selectedChord);
  const selectChord = useHarmonyUIStore((s) => s.selectChord);
  const snap = useHarmonyUIStore((s) => s.snap);
  const setSnap = useHarmonyUIStore((s) => s.setSnap);

  const laneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  /** The lane holds pointer capture, so a chord never sees its own dblclick. */
  const lastTapRef = useRef<{ id: string; at: number } | null>(null);
  const [draft, setDraft] = useState<TimelineChord[] | null>(null);
  const [editing, setEditing] = useState<{ chordId: string; anchor: HTMLElement } | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [progression, setProgression] = useState(-1);
  const stored = useMemo(() => sortChords(track.chords ?? []), [track.chords]);
  const [progressionKey, setProgressionKey] = useState(() => stored[0]?.root ?? 0);
  const chords = draft ?? stored;
  const step = snapTicks(tempo, snap);
  const bar = barTicks(tempo);
  const selectedId = selected?.trackId === track.id ? selected.chordId : null;

  const tickToX = useCallback((tick: number) => docTickToMs(tick, tempo) / msPerPx, [tempo, msPerPx]);
  const tickAt = useCallback(
    (clientX: number): number => {
      const rect = laneRef.current?.getBoundingClientRect();
      const x = rect ? clientX - rect.left : 0;
      return Math.max(0, msToDocTick(x * msPerPx, tempo));
    },
    [msPerPx, tempo]
  );

  const commit = useCallback((next: TimelineChord[]) => setTrackChords(track.id, next), [setTrackChords, track.id]);

  /** The chord a gesture produces, and the list with it placed. */
  const shaped = useCallback(
    (d: Drag, tick: number): { list: TimelineChord[]; chord: TimelineChord } => {
      if (d.mode === "draw") {
        const start = snapDown(Math.min(d.fromTick, tick), step);
        let end: number;
        if (d.moved) {
          end = snapDown(Math.max(d.fromTick, tick), step) + step;
        } else {
          // A click fills to the next bar line, stopping at the next chord.
          const next = stored.find((c) => c.startTick > start);
          end = Math.min(snapDown(start, bar) + bar, next?.startTick ?? Infinity);
          if (end <= start) end = start + step;
        }
        const before = [...stored].reverse().find((c) => c.startTick <= start);
        const template = stored.find((c) => c.id === selectedId) ?? before;
        const chord: TimelineChord = {
          id: createTimeOrderedUuid(),
          startTick: start,
          durationTick: end - start,
          root: template?.root ?? progressionKey,
          quality: template?.quality ?? "maj",
          inversion: 0
        };
        return { list: placeChord(stored, chord, () => createTimeOrderedUuid()), chord };
      }
      const { orig } = d;
      const rest = stored.filter((c) => c.id !== orig.id);
      const origEnd = orig.startTick + orig.durationTick;
      let chord: TimelineChord;
      if (d.mode === "move") {
        chord = { ...orig, startTick: snapNearest(orig.startTick + tick - d.grabTick, step) };
      } else if (d.mode === "right") {
        const end = Math.max(orig.startTick + step, snapNearest(tick, step));
        chord = { ...orig, durationTick: end - orig.startTick };
      } else {
        const start = Math.min(origEnd - step, snapNearest(tick, step));
        chord = { ...orig, startTick: Math.max(0, start), durationTick: origEnd - Math.max(0, start) };
      }
      return { list: placeChord(rest, chord, () => createTimeOrderedUuid()), chord };
    },
    [bar, progressionKey, selectedId, step, stored]
  );

  const begin = (e: React.PointerEvent, d: Drag): void => {
    if (track.locked || e.button !== 0) return;
    e.stopPropagation();
    laneRef.current?.setPointerCapture?.(e.pointerId);
    dragRef.current = d;
  };
  const onPointerMove = (e: React.PointerEvent): void => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.startX) < DRAG_SLOP_PX) return;
    d.moved = true;
    setDraft(shaped(d, tickAt(e.clientX)).list);
  };
  const onPointerUp = (e: React.PointerEvent): void => {
    const d = dragRef.current;
    dragRef.current = null;
    setDraft(null);
    if (!d) return;
    if (d.mode !== "draw" && !d.moved) {
      const id = d.orig.id;
      const last = lastTapRef.current;
      if (last && last.id === id && e.timeStamp - last.at < DOUBLE_TAP_MS) {
        lastTapRef.current = null;
        const anchor = laneRef.current?.querySelector<HTMLElement>(`[data-chord-id="${CSS.escape(id)}"]`);
        if (anchor) setEditing({ chordId: id, anchor });
      } else {
        lastTapRef.current = { id, at: e.timeStamp };
      }
      return;
    }
    const { list, chord } = shaped(d, tickAt(e.clientX));
    commit(list);
    selectChord({ trackId: track.id, chordId: chord.id });
  };

  const removeChord = (id: string): void => {
    commit(stored.filter((c) => c.id !== id));
    if (selectedId === id) selectChord(null);
    setEditing(null);
  };

  // Visible bar and beat lines.
  const fromMs = scrollLeftPx * msPerPx;
  const toMs = (scrollLeftPx + viewportPx) * msPerPx;
  const beat = beatTicks(tempo);
  const lineStep = tickToX(beat) - tickToX(0) >= MIN_GRID_PX ? beat : bar;
  const firstLine = Math.max(0, Math.floor(msToDocTick(fromMs, tempo) / lineStep));
  const lastLine = Math.ceil(msToDocTick(toMs, tempo) / lineStep);
  const lines: { tick: number; bar: boolean }[] = [];
  for (let i = firstLine; i <= lastLine && lines.length < 2000; i++) {
    const tick = i * lineStep;
    lines.push({ tick, bar: tick % bar === 0 });
  }

  const loadProgression = (index: number): void => {
    const fromTick = Math.ceil(msToDocTick(fromMs, tempo) / bar - 1e-6) * bar;
    const toTick = Math.max(fromTick + bar, Math.floor(msToDocTick(toMs, tempo) / bar + 1e-6) * bar);
    commit(fillProgression(stored, index, progressionKey, fromTick, toTick, bar));
    setProgression(index);
  };

  const editingChord = editing ? stored.find((c) => c.id === editing.chordId) : undefined;

  return (
    <div
      ref={laneRef}
      className="fablesynth harmony-root harmony-lane"
      data-testid={`chord-lane-body-${track.id}`}
      aria-label={`Chord track ${track.name}: click an empty spot to add a chord`}
      onPointerDown={(e) => begin(e, { mode: "draw", fromTick: tickAt(e.clientX), startX: e.clientX, moved: false })}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragRef.current = null;
        setDraft(null);
      }}
    >
      {lines.map((l) => (
        <span key={l.tick} className={`hl-beat${l.bar ? " bar" : ""}`} style={{ left: tickToX(l.tick) }} />
      ))}
      {chords.map((c) => {
        const left = tickToX(c.startTick);
        const width = tickToX(c.startTick + c.durationTick) - left;
        const isSelected = c.id === selectedId && !draft;
        return (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            data-chord-id={c.id}
            className={`hl-chord${isSelected ? " selected" : ""}${draft ? " draft" : ""}`}
            style={{ left, width: Math.max(2, width - 1), "--hue": chordHue(c.root) } as React.CSSProperties}
            aria-label={`${chordName(c)} chord`}
            aria-pressed={isSelected}
            onPointerDown={(e) => {
              selectChord({ trackId: track.id, chordId: c.id });
              begin(e, { mode: "move", orig: c, grabTick: tickAt(e.clientX), startX: e.clientX, moved: false });
            }}
            onKeyDown={(e) => {
              if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                e.stopPropagation();
                removeChord(c.id);
              } else if (e.key === "Enter") {
                setEditing({ chordId: c.id, anchor: e.currentTarget });
              }
            }}
          >
            {width > 18 && (
              <span>
                {chordName(c)}
                {c.inversion ? <sup>/{c.inversion}</sup> : null}
              </span>
            )}
            <i
              className="hl-edge left"
              aria-hidden
              onPointerDown={(e) => {
                selectChord({ trackId: track.id, chordId: c.id });
                begin(e, { mode: "left", orig: c, grabTick: tickAt(e.clientX), startX: e.clientX, moved: false });
              }}
            />
            <i
              className="hl-edge right"
              aria-hidden
              onPointerDown={(e) => {
                selectChord({ trackId: track.id, chordId: c.id });
                begin(e, { mode: "right", orig: c, grabTick: tickAt(e.clientX), startX: e.clientX, moved: false });
              }}
            />
          </div>
        );
      })}
      {!chords.length && <span className="hl-empty">CLICK TO ADD A CHORD · OR LOAD A PROGRESSION</span>}
      <div className="hl-tools" style={{ left: 0, transform: `translateX(${scrollLeftPx}px)` }} onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="ns-btn" disabled={track.locked} onClick={() => setBrowsing(true)}>
          PROGRESSION
        </button>
        <select className="ns-btn" aria-label="Chord snap" value={snap} onChange={(e) => setSnap(e.target.value as ChordSnap)}>
          <option value="bar">BAR</option>
          <option value="beat">BEAT</option>
          <option value="sixteenth">1/16</option>
        </select>
      </div>
      {editing && editingChord && (
        <Popover open anchorEl={editing.anchor} onClose={() => setEditing(null)} placement="bottom-left">
          <div className="fablesynth harmony-root chord-popover" onPointerDown={(e) => e.stopPropagation()}>
            <ChordEditor
              chord={editingChord}
              onChange={(patch) => commit(stored.map((c) => (c.id === editingChord.id ? { ...c, ...patch } : c)))}
              onDelete={() => removeChord(editingChord.id)}
            />
          </div>
        </Popover>
      )}
      {browsing && (
        <div className="fablesynth harmony-root harmony-overlay" onPointerDown={(e) => e.stopPropagation()}>
          <ProgressionBrowser
            chordKey={progressionKey}
            setKey={setProgressionKey}
            current={progression}
            load={loadProgression}
            onClose={() => setBrowsing(false)}
            target="THE CHORDS IN THE VISIBLE BARS"
          />
        </div>
      )}
    </div>
  );
}
