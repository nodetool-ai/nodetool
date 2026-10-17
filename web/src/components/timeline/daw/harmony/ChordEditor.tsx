/**
 * Root, quality and inversion of one chord, with its voicing. FableSynth's
 * chord editor row (src/components/panels/ChordTrack.tsx).
 */

import React from "react";
import {
  CHORD_QUALITIES,
  CHORD_QUALITY_IDS,
  chordName,
  chordNotes,
  noteName,
  PITCH_NAMES
} from "@nodetool-ai/timeline";
import type { ChordQuality, TimelineChord } from "@nodetool-ai/timeline";

import { chordHue } from "./chordGrid";

export interface ChordEditorProps {
  chord: TimelineChord;
  /** Octave the voicing preview is read in. */
  octave?: number;
  onChange: (patch: Partial<TimelineChord>) => void;
  onDelete: () => void;
}

export function ChordEditor({ chord, octave = 3, onChange, onDelete }: ChordEditorProps): React.JSX.Element {
  const voicing = chordNotes(chord, (octave + 1) * 12);
  const maxInversion = CHORD_QUALITIES[chord.quality].iv.length - 1;
  return (
    <div className="chord-editor" data-testid="chord-editor">
      <span className="chord-editing">SELECTED</span>
      <strong className="chord-name" style={{ "--hue": chordHue(chord.root) } as React.CSSProperties}>
        {chordName(chord)}
      </strong>
      <label className="arp-field">
        ROOT
        <select aria-label="Chord root" value={chord.root} onChange={(e) => onChange({ root: Number(e.target.value) })}>
          {PITCH_NAMES.map((n, r) => (
            <option key={n} value={r}>{n}</option>
          ))}
        </select>
      </label>
      <label className="arp-field">
        TYPE
        <select
          aria-label="Chord type"
          value={chord.quality}
          onChange={(e) => onChange({ quality: e.target.value as ChordQuality, inversion: 0 })}
        >
          {CHORD_QUALITY_IDS.map((k) => (
            <option key={k} value={k}>{CHORD_QUALITIES[k].name}</option>
          ))}
        </select>
      </label>
      <div className="arp-octave">
        <button type="button" aria-label="Previous inversion" disabled={!chord.inversion} onClick={() => onChange({ inversion: chord.inversion - 1 })}>−</button>
        <span>INV {chord.inversion}</span>
        <button type="button" aria-label="Next inversion" disabled={chord.inversion >= maxInversion} onClick={() => onChange({ inversion: chord.inversion + 1 })}>+</button>
      </div>
      <span className="chord-voicing">{voicing.map(noteName).join(" · ")}</span>
      <button type="button" className="ns-btn chord-delete" onClick={onDelete}>DELETE</button>
    </div>
  );
}
