/**
 * Chord progression library browser, from FableSynth
 * src/components/panels/ProgressionBrowser.tsx. Loading a progression fills
 * the chord track over the bars it is asked to fill.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  chordName,
  MIDI_PPQ,
  PITCH_NAMES,
  PROGRESSION_FAMILIES,
  progressionChords,
  progressionFamily,
  progressionLengthTicks,
  PROGRESSIONS
} from "@nodetool-ai/timeline";
import type { TimelineChord } from "@nodetool-ai/timeline";

import { chordHue } from "./chordGrid";

/** Pixels per sixteenth in the 4-bar preview strip. */
const PX_PER_16TH = 5;
const TICKS_PER_16TH = MIDI_PPQ / 4;

/** Four bars of chord blocks, coloured by root like the chord track. */
export function ProgressionGrid({ chords }: { chords: ReadonlyArray<TimelineChord> }): React.JSX.Element {
  const origin = chords[0]?.startTick ?? 0;
  return (
    <svg className="comp-grid prog-grid" viewBox="0 0 320 26" aria-hidden="true">
      {[0, 1, 2, 3].map((b) => (
        <rect key={b} x={b * 80} y={0} width={1} height={26} className="beat" />
      ))}
      {chords.map((c) => {
        const x = ((c.startTick - origin) / TICKS_PER_16TH) * PX_PER_16TH;
        const w = (c.durationTick / TICKS_PER_16TH) * PX_PER_16TH;
        if (x >= 320) return null;
        return (
          <g key={c.id} style={{ "--hue": chordHue(c.root) } as React.CSSProperties}>
            <rect x={x + 1.5} y={3} width={Math.min(w, 320 - x) - 3} height={20} rx={2} />
            <text x={x + 5} y={16.5}>{chordName(c)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export interface ProgressionBrowserProps {
  chordKey: number;
  setKey: (key: number) => void;
  /** Index into PROGRESSIONS of the loaded progression, or -1. */
  current: number;
  load: (index: number) => void;
  onClose: () => void;
  /** What a load replaces, shown in the footer. */
  target: string;
}

export function ProgressionBrowser({ chordKey, setKey, current, load, onClose, target }: ProgressionBrowserProps): React.JSX.Element {
  const [family, setFamily] = useState("ALL");
  const [query, setQuery] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const entries = useMemo(
    () =>
      PROGRESSIONS.map((p, i) => {
        const chords = progressionChords(p, chordKey);
        return { p, i, family: progressionFamily(p), chords, bars: Math.ceil(progressionLengthTicks(p) / (MIDI_PPQ * 4)) };
      }),
    [chordKey]
  );
  const shown = useMemo(() => {
    const q = query.trim().toUpperCase();
    return entries.filter(
      (e) =>
        (family === "ALL" || e.family === family) &&
        (!q || `${e.p.name} ${e.p.mood} ${e.family} ${e.chords.map(chordName).join(" ")}`.toUpperCase().includes(q))
    );
  }, [entries, family, query]);
  useEffect(() => {
    list.current?.querySelector("[aria-selected=true]")?.scrollIntoView?.({ block: "nearest" });
  }, [current, shown]);
  const step = (d: number): void => {
    if (!shown.length) return;
    const at = shown.findIndex((s) => s.i === current);
    load(shown[at < 0 ? 0 : (at + d + shown.length) % shown.length].i);
  };
  const counts = useMemo(
    () => Object.fromEntries(PROGRESSION_FAMILIES.map((f) => [f.name, entries.filter((e) => e.family === f.name).length])),
    [entries]
  );
  return (
    <div
      className="comp-browser"
      role="dialog"
      aria-label="Chord progression browser"
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter") {
          e.preventDefault();
          onClose();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          step(e.key === "ArrowDown" ? 1 : -1);
        }
      }}
    >
      <div className="comp-browser-head">
        <h3>
          CHORD PROGRESSIONS <span>{shown.length} / {PROGRESSIONS.length} · IN {PITCH_NAMES[chordKey]}</span>
        </h3>
        <label className="arp-field">
          KEY
          <select aria-label="Progression key" value={chordKey} onChange={(e) => setKey(Number(e.target.value))}>
            {PITCH_NAMES.map((n, i) => (
              <option key={n} value={i}>{n}</option>
            ))}
          </select>
        </label>
        <input
          autoFocus
          type="search"
          aria-label="Search chord progressions"
          placeholder="SEARCH MOOD, NUMERALS OR CHORD"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="ns-btn"
          onClick={() => shown.length && load(shown[Math.floor(Math.random() * shown.length)].i)}
        >
          RANDOM
        </button>
        <button type="button" className="ns-btn nav-btn" onClick={onClose}>DONE</button>
      </div>
      <div className="comp-browser-body">
        <div className="comp-browser-families" aria-label="Progression family">
          {["ALL", ...PROGRESSION_FAMILIES.map((f) => f.name)].map((f) => (
            <button key={f} type="button" aria-pressed={family === f} onClick={() => setFamily(f)}>
              {f}
              <span>{f === "ALL" ? PROGRESSIONS.length : counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="comp-browser-list" ref={list} role="listbox" aria-label="Chord progressions">
          {shown.map(({ p, i, chords, bars }) => (
            <button key={i} type="button" role="option" aria-selected={i === current} onClick={() => load(i)} onDoubleClick={onClose}>
              <span className="comp-name">{p.mood}</span>
              <span className="comp-family">{p.name}</span>
              <ProgressionGrid chords={chords} />
              <span className="comp-meta">
                {bars} BAR{bars > 1 ? "S" : ""} · {chords.length} CHORDS
              </span>
            </button>
          ))}
          {!shown.length && <span className="arp-empty">No progression matches.</span>}
        </div>
      </div>
      <div className="comp-browser-foot">
        CLICK TO LOAD · ↑ ↓ STEP THROUGH THE LIST · LOADING REPLACES {target} · ENTER / ESC CLOSES
      </div>
    </div>
  );
}
