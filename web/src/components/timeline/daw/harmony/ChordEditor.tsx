/**
 * Root, quality and inversion of one chord, with its voicing. FableSynth's
 * chord editor row (src/components/panels/ChordTrack.tsx).
 */

import React from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const voicing = chordNotes(chord, (octave + 1) * 12);
  const maxInversion = CHORD_QUALITIES[chord.quality].iv.length - 1;
  return (
    <div className="chord-editor" data-testid="chord-editor">
      <span className="chord-editing">{t("i18n-next20.chordEditor.selected")}</span>
      <strong className="chord-name" style={{ "--hue": chordHue(chord.root) } as React.CSSProperties}>
        {chordName(chord)}
      </strong>
      <label className="arp-field">
        {t("i18n-next20.chordEditor.root")}
        <select aria-label={t("i18n-next20.chordEditor.root")} value={chord.root} onChange={(e) => onChange({ root: Number(e.target.value) })}>
          {PITCH_NAMES.map((n, r) => (
            <option key={n} value={r}>{n}</option>
          ))}
        </select>
      </label>
      <label className="arp-field">
        {t("i18n-next20.chordEditor.type")}
        <select
          aria-label={t("i18n-next20.chordEditor.type")}
          value={chord.quality}
          onChange={(e) => onChange({ quality: e.target.value as ChordQuality, inversion: 0 })}
        >
          {CHORD_QUALITY_IDS.map((k) => (
            <option key={k} value={k}>{CHORD_QUALITIES[k].name}</option>
          ))}
        </select>
      </label>
      <div className="arp-octave">
        <button type="button" aria-label={t("i18n-next20.chordEditor.previousInversion")} disabled={!chord.inversion} onClick={() => onChange({ inversion: chord.inversion - 1 })}>−</button>
        <span>{t("i18n-next20.chordEditor.inversion", { count: chord.inversion })}</span>
        <button type="button" aria-label={t("i18n-next20.chordEditor.nextInversion")} disabled={chord.inversion >= maxInversion} onClick={() => onChange({ inversion: chord.inversion + 1 })}>+</button>
      </div>
      <span className="chord-voicing">{voicing.map(noteName).join(" · ")}</span>
      <button type="button" className="ns-btn chord-delete" onClick={onDelete}>{t("i18n-next20.chordEditor.delete")}</button>
    </div>
  );
}
