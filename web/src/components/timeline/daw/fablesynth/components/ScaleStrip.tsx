import type { ArpState } from '../arp';
import { PITCH_NAMES } from '../chords';
import { resolvedKeyScale, SCALE_MODES, SCALE_TYPES, SCALES, scaleLabel, scaleModeOf, scaleSegments, type ScaleMode, type ScaleType } from '../scales';
import { ChordTrack, type ChordLink } from './panels/ChordTrack';
import './panels/arp.css';
import './scaleStrip.css';

/** The scale settings a note sequencer edits: the device arp (standalone) or the clip arp (SQ-4). */
export interface ScaleBinding {
  a: ArpState;
  update: (patch: Partial<ArpState>) => void;
  /** Chord-track length in bars, and how to change it. */
  bars: number;
  setBars?: (bars: number) => void;
  /** SQ-4: scene-wide chord linking. */
  link?: ChordLink;
}

const MODE_LABEL: Record<ScaleMode, string> = { off: 'OFF', key: 'KEY', chords: 'CHORDS', follow: 'FOLLOW' };

/** Scale mode for written notes: OFF, one KEY scale, a scale per chord of the chord track,
 *  or FOLLOW: notes move with the chord track away from the chords they were written over. */
export function ScaleStrip({ scale: { a, update, bars, setBars, link }, step }: { scale: ScaleBinding; step?: number }) {
  const mode = scaleModeOf(a), chordMode = mode === 'chords' || mode === 'follow';
  const auto = resolvedKeyScale({ ...a, scaleType: 'auto' });
  const segs = chordMode ? scaleSegments(a, bars) : [];
  const total = bars * 16;
  const setMode = (m: ScaleMode) =>
    // CHORDS and FOLLOW use the chord track, so they also show that track on the ARP page.
    // FOLLOW takes the current chords as the ones the notes are written over.
    update(m === 'follow' ? { scale: m, input: 'chords', followChords: a.chords.map(c => ({ ...c })) }
      : m === 'chords' ? { scale: m, input: 'chords' } : { scale: m === 'off' ? undefined : m });
  // KEY transposes the chord track with it, like the chord track's own KEY.
  const setKey = (key: number) =>
    update({ chordKey: key, chords: a.chords.map(c => ({ ...c, root: (c.root + key - a.chordKey + 12) % 12 })) });
  return <div className={`scale-strip${mode !== 'off' ? ' on' : ''}`} data-sequence-controls>
    <span className="scale-strip-title">SCALE</span>
    <div className="scale-strip-segment" role="radiogroup" aria-label="Scale mode">
      {SCALE_MODES.map(m => <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>{MODE_LABEL[m]}</button>)}
    </div>
    {mode === 'key' && <>
      <label className="scale-strip-field">KEY<select aria-label="Scale key" value={a.chordKey} onChange={e => setKey(+e.target.value)}>
        {PITCH_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
      </select></label>
    </>}
    {mode !== 'off' && <>
      <label className="scale-strip-field">{chordMode ? 'HOME' : 'SCALE'}<select aria-label="Scale type" value={a.scaleType ?? 'auto'}
        onChange={e => update({ scaleType: e.target.value === 'auto' ? undefined : e.target.value as ScaleType })}>
        {SCALE_TYPES.map(t => <option key={t} value={t}>{t === 'auto' ? `AUTO · ${SCALES[auto].name}` : SCALES[t].name}</option>)}
      </select></label>
    </>}
    {mode === 'chords' && <span className="scale-strip-hint">EACH CHORD SETS THE SCALE · GAPS USE HOME</span>}
    {mode === 'follow' && <span className="scale-strip-hint">NOTES KEEP THEIR PLACE AGAINST THE CHORDS · A NEW CHORD MOVES THEM · CLICK FOLLOW TO RE-ANCHOR</span>}
    {chordMode && <div className="scale-strip-chordtrack">
      <ChordTrack a={a} update={update} bars={bars} setBars={setBars} link={link}
        pos={step !== undefined && step >= 0 ? step % total : -1}
        scaleOf={c => { const s = segs.find(g => g.chord === c); return s && SCALES[s.scale].name; }} />
    </div>}
    {mode === 'key' && <span className="scale-strip-hint">{scaleLabel({ root: a.chordKey, scale: resolvedKeyScale(a) })} · NOTES SNAP AT PLAYBACK</span>}
  </div>;
}

/** Grid cell class for a lane of pitch class `pc` at a step whose scale allows `mask`. */
export const scaleCellClass = (mask: number | undefined, pc: number) =>
  mask === undefined ? '' : (mask >> (((pc % 12) + 12) % 12) & 1) ? ' in-scale' : ' off-scale';
