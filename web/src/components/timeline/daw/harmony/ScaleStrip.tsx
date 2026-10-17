/**
 * Scale snapping for a clip's written notes, from FableSynth
 * src/components/ScaleStrip.tsx: OFF, one KEY scale, or each chord's scale
 * (CHORDS). FOLLOW is not ported.
 */

import React from "react";
import {
  chordTrackFor,
  harmonyKey,
  keyScale,
  PITCH_NAMES,
  SCALE_IDS,
  SCALES,
  scaleLabel
} from "@nodetool-ai/timeline";
import type { ClipHarmony, HarmonyScaleMode, ResolvedClipHarmony, TimelineTrack } from "@nodetool-ai/timeline";

const MODES: [HarmonyScaleMode, string][] = [
  ["off", "OFF"],
  ["key", "KEY"],
  ["chords", "CHORDS"]
];

export interface ScaleStripProps {
  harmony: ResolvedClipHarmony;
  tracks: ReadonlyArray<TimelineTrack>;
  update: (patch: Partial<ClipHarmony>) => void;
}

export function ScaleStrip({ harmony, tracks, update }: ScaleStripProps): React.JSX.Element {
  const chords = chordTrackFor(harmony, tracks)?.chords ?? [];
  const key = harmonyKey(harmony, chords);
  const auto = keyScale(chords, key);
  const mode = harmony.scale;
  const resolved = harmony.scaleType === "auto" ? auto : harmony.scaleType;
  return (
    <div className={`scale-strip${mode !== "off" ? " on" : ""}`} data-testid="harmony-scale-strip">
      <span className="scale-strip-title">SCALE</span>
      <div className="scale-strip-segment" role="radiogroup" aria-label="Scale mode">
        {MODES.map(([m, label]) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => update({ scale: m })}>
            {label}
          </button>
        ))}
      </div>
      {mode !== "off" && (
        <>
          <label className="scale-strip-field">
            KEY
            <select aria-label="Scale key" value={key} onChange={(e) => update({ scaleKey: Number(e.target.value) })}>
              {PITCH_NAMES.map((n, i) => (
                <option key={n} value={i}>{n}</option>
              ))}
            </select>
          </label>
          <label className="scale-strip-field">
            {mode === "chords" ? "HOME" : "SCALE"}
            <select aria-label="Scale type" value={harmony.scaleType} onChange={(e) => update({ scaleType: e.target.value as ClipHarmony["scaleType"] })}>
              <option value="auto">AUTO · {SCALES[auto].name}</option>
              {SCALE_IDS.map((t) => (
                <option key={t} value={t}>{SCALES[t].name}</option>
              ))}
            </select>
          </label>
        </>
      )}
      {mode === "key" && <span className="scale-strip-hint">{scaleLabel(key, resolved)} · WRITTEN NOTES SNAP AT PLAYBACK</span>}
      {mode === "chords" && <span className="scale-strip-hint">EACH CHORD SETS THE SCALE · GAPS USE HOME</span>}
    </div>
  );
}
