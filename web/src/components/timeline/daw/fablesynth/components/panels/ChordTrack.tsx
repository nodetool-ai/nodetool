import { useRef, useState, type PointerEvent } from 'react';
import type { ArpState } from '../../arp';
import { CHORD_QUALITIES, chordName, chordNotes, PITCH_NAMES, placeChord, PROGRESSIONS, progressionChords, progressionIndex, type ArpChord, type ChordQuality } from '../../chords';
import { noteName } from '../../arp';
import { ProgressionBrowser } from './ProgressionBrowser';

interface Drag { mode: 'draw' | 'move' | 'resize'; idx: number; from: number; orig?: ArpChord }
/** SQ-4 scene linking: `peers` counts the scene's other linked chord tracks. */
export interface ChordLink { on: boolean; peers: number; toggle: () => void }
export interface ChordTrackProps {
  a: ArpState; update: (patch: Partial<ArpState>) => void;
  bars: number; setBars?: (bars: number) => void;
  /** Playhead in sixteenths, or -1 when stopped. */
  pos: number;
  link?: ChordLink;
  /** Scale mode CHORDS: the scale each chord gives the written notes. */
  scaleOf?: (c: ArpChord) => string | undefined;
}

export function ChordTrack({ a, update, bars, setBars, pos, link, scaleOf }: ChordTrackProps) {
  const total = bars * 16;
  const grid = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState(0);
  const [snap, setSnap] = useState(4);
  const [browsing, setBrowsing] = useState(false);
  // A ref, so pointer events in one frame see the drag before React re-renders.
  const dragRef = useRef<Drag | null>(null);
  const [draft, setDraft] = useState<ArpChord[] | null>(null);
  const chords = draft ?? a.chords;
  const drag = draft ? dragRef.current : null;
  const selected = a.chords[sel] as ArpChord | undefined;
  const cellAt = (e: PointerEvent) => {
    const r = grid.current!.getBoundingClientRect();
    return Math.max(0, Math.min(total - 1, Math.floor((e.clientX - r.left) / r.width * total)));
  };
  const down = (s: number) => Math.floor(s / snap) * snap;
  const shaped = (d: Drag, cell: number): { list: ArpChord[]; chord: ArpChord } => {
    const rest = d.idx >= 0 ? a.chords.filter((_, i) => i !== d.idx) : a.chords;
    let chord: ArpChord;
    if (d.mode === 'draw') {
      const lo = down(Math.min(d.from, cell)), hi = Math.min(total, down(Math.max(d.from, cell)) + snap);
      const tpl = selected ?? { root: a.chordKey, quality: 'min' as ChordQuality, inversion: 0 };
      chord = { start: lo, length: hi - lo, root: tpl.root, quality: tpl.quality, inversion: tpl.inversion };
    } else if (d.mode === 'resize') {
      const end = Math.max(d.orig!.start + 1, Math.min(total, down(cell) + snap));
      chord = { ...d.orig!, length: end - d.orig!.start };
    } else {
      const start = Math.max(0, Math.min(total - d.orig!.length, d.orig!.start + down(cell - d.from + snap / 2)));
      chord = { ...d.orig!, start };
    }
    return { list: placeChord(rest, chord), chord };
  };
  const begin = (e: PointerEvent, d: Drag) => {
    e.stopPropagation();
    grid.current!.setPointerCapture(e.pointerId);
    dragRef.current = d;
    setDraft(shaped(d, cellAt(e)).list);
  };
  const move = (e: PointerEvent) => { if (dragRef.current) setDraft(shaped(dragRef.current, cellAt(e)).list); };
  const end = (e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const { list, chord } = shaped(d, cellAt(e));
    dragRef.current = null; setDraft(null);
    update({ chords: list });
    setSel(list.indexOf(chord));
  };
  const edit = (patch: Partial<ArpChord>) => selected && update({ chords: a.chords.map((c, i) => i === sel ? { ...c, ...patch } : c) });
  const setKey = (key: number) => update({ chordKey: key, chords: a.chords.map(c => ({ ...c, root: (c.root + key - a.chordKey + 12) % 12 })) });
  const loadPreset = (i: number) => {
    const p = PROGRESSIONS[i];
    if (!p) return;
    const { chords: next, bars: need } = progressionChords(p, a.chordKey);
    update({ chords: next });
    setSel(0);
    if (setBars && need !== bars) setBars(need);
  };
  const preset = progressionIndex(a.chords, a.chordKey);
  const stepPreset = (d: number) => loadPreset((Math.max(preset, d > 0 ? -1 : 0) + d + PROGRESSIONS.length) % PROGRESSIONS.length);
  const voicing = selected ? chordNotes(selected, (a.chordOctave + 1) * 12) : [];

  return <div className="chord-track">
    <div className="chord-tools">
      <div className="arp-pattern-pick">
        <button type="button" aria-label="Previous chord progression" title="Previous progression" onClick={() => stepPreset(-1)}>‹</button>
        <button type="button" className="pattern-name" aria-label="Browse chord progressions" title={`Browse ${PROGRESSIONS.length} progressions by mood`} onClick={() => setBrowsing(true)}>
          <strong>{preset < 0 ? a.chords.length ? 'CUSTOM PROGRESSION' : 'START FROM A PROGRESSION' : PROGRESSIONS[preset].mood}</strong>
          {preset >= 0 && <em>{PROGRESSIONS[preset].name}</em>}
          <span className="browse">BROWSE</span>
        </button>
        <button type="button" aria-label="Next chord progression" title="Next progression" onClick={() => stepPreset(1)}>›</button>
      </div>
      <label className="arp-field">KEY<select aria-label="Chord key" value={a.chordKey} onChange={e => setKey(+e.target.value)}>
        {PITCH_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
      </select></label>
      <div className="arp-octave"><button aria-label="Lower chord octave" disabled={a.chordOctave <= 1} onClick={() => update({ chordOctave: a.chordOctave - 1 })}>−</button><span>OCT {a.chordOctave}</span><button aria-label="Raise chord octave" disabled={a.chordOctave >= 5} onClick={() => update({ chordOctave: a.chordOctave + 1 })}>+</button></div>
      {setBars && <div className="arp-seg" role="group" aria-label="Sequence length">{[1, 2, 3, 4].map(n => <button key={n} type="button" title={`${n} bar${n > 1 ? 's' : ''}`} aria-pressed={bars === n} onClick={() => setBars(n)}>{n} BAR{n > 1 ? 'S' : ''}</button>)}</div>}
      {link && <button type="button" className={`ns-btn chord-link${link.on ? ' on' : ''}`} aria-pressed={link.on} onClick={link.toggle}
        title={link.on ? 'Linked: chord and key edits apply to every linked track in this scene' : 'Share this progression with the other linked tracks in this scene'}>
        {link.on ? link.peers ? `LINKED · ${link.peers + 1} TRACKS` : 'LINKED · ONLY TRACK' : link.peers ? `LINK (${link.peers} LINKED)` : 'LINK TRACKS'}</button>}
      <label className="arp-field">SNAP<select aria-label="Chord snap" value={snap} onChange={e => setSnap(+e.target.value)}>
        <option value={1}>1/16</option><option value={2}>1/8</option><option value={4}>1/4</option><option value={8}>1/2</option><option value={16}>BAR</option>
      </select></label>
    </div>
    <div ref={grid} className={`chord-grid${drag ? ' dragging' : ''}`} style={{ '--cells': total } as React.CSSProperties}
      aria-label="Chord track: drag on empty space to draw a chord"
      onPointerDown={e => begin(e, { mode: 'draw', idx: -1, from: cellAt(e) })} onPointerMove={move} onPointerUp={end} onPointerCancel={() => { dragRef.current = null; setDraft(null); }}>
      {Array.from({ length: bars * 4 }, (_, i) => <span key={i} className={`chord-beat${i % 4 === 0 ? ' bar' : ''}`} style={{ left: `${i / (bars * 4) * 100}%` }}>{i % 4 === 0 ? i / 4 + 1 : ''}</span>)}
      {chords.filter(c => c.start < total).map(c => {
        const i = a.chords.indexOf(c);
        const len = Math.min(c.length, total - c.start);
        return <div key={`${c.start}-${c.length}-${c.root}-${c.quality}`} role="button" tabIndex={0}
          className={`chord-block${i === sel && !drag ? ' selected' : ''}${pos >= c.start && pos < c.start + len ? ' sounding' : ''}`}
          style={{ left: `${c.start / total * 100}%`, width: `${len / total * 100}%`, '--hue': c.root * 30 } as React.CSSProperties}
          aria-label={`${chordName(c)}, ${c.length} sixteenths`}
          onKeyDown={e => { if ((e.key === 'Delete' || e.key === 'Backspace') && i >= 0) update({ chords: a.chords.filter((_, j) => j !== i) }); }}
          onPointerDown={e => { if (i < 0) return; setSel(i); begin(e, { mode: 'move', idx: i, from: cellAt(e), orig: c }); }}>
          <span>{chordName(c)}{c.inversion ? <sup>/{c.inversion}</sup> : null}</span>
          {scaleOf && <em className="chord-scale">{scaleOf(c)}</em>}
          <i className="chord-handle" aria-hidden onPointerDown={e => { if (i < 0) return; setSel(i); begin(e, { mode: 'resize', idx: i, from: cellAt(e), orig: c }); }} />
        </div>;
      })}
      {pos >= 0 && <div className="chord-playhead" style={{ left: `${pos / total * 100}%` }} />}
    </div>
    {selected ? <div className="chord-editor">
      <span className="chord-editing">SELECTED</span>
      <strong className="chord-name" style={{ '--hue': selected.root * 30 } as React.CSSProperties}>{chordName(selected)}</strong>
      <label className="arp-field">ROOT<select aria-label="Chord root" value={selected.root} onChange={e => edit({ root: +e.target.value })}>
        {PITCH_NAMES.map((n, r) => <option key={r} value={r}>{n}</option>)}
      </select></label>
      <label className="arp-field">TYPE<select aria-label="Chord type" value={selected.quality} onChange={e => edit({ quality: e.target.value as ChordQuality, inversion: 0 })}>
        {Object.entries(CHORD_QUALITIES).map(([k, q]) => <option key={k} value={k}>{q.name}</option>)}
      </select></label>
      <div className="arp-octave"><button aria-label="Previous inversion" disabled={!selected.inversion} onClick={() => edit({ inversion: selected.inversion - 1 })}>−</button><span>INV {selected.inversion}</span><button aria-label="Next inversion" disabled={selected.inversion >= CHORD_QUALITIES[selected.quality].iv.length - 1} onClick={() => edit({ inversion: selected.inversion + 1 })}>+</button></div>
      <span className="chord-voicing">{voicing.map(noteName).join(' · ')}</span>
      <button className="ns-btn chord-delete" onClick={() => { update({ chords: a.chords.filter((_, j) => j !== sel) }); setSel(Math.max(0, sel - 1)); }}>DELETE</button>
    </div> : <div className="chord-editor"><span className="arp-empty">Drag across the empty track to draw a chord.</span></div>}
    <p className="chord-help">DRAG EMPTY SPACE TO DRAW · DRAG A CHORD TO MOVE · DRAG ITS RIGHT EDGE TO RESIZE · DELETE KEY REMOVES</p>
    {browsing && <ProgressionBrowser chordKey={a.chordKey} current={preset} load={loadPreset} onClose={() => setBrowsing(false)} />}
  </div>;
}
