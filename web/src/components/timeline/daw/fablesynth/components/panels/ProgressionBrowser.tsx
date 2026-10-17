import { useEffect, useMemo, useRef, useState } from 'react';
import { chordName, PITCH_NAMES, PROGRESSION_FAMILIES, progressionChords, progressionFamily, PROGRESSIONS, type ArpChord } from '../../chords';
import './compBrowser.css';

/** Four bars of chord blocks, coloured by root like the chord track. */
export function ProgressionGrid({ chords }: { chords: ArpChord[] }) {
  return <svg className="comp-grid prog-grid" viewBox="0 0 320 26" aria-hidden="true">
    {[0, 1, 2, 3].map(b => <rect key={b} x={b * 80} y={0} width={1} height={26} className="beat" />)}
    {chords.map(c => <g key={c.start} style={{ '--hue': c.root * 30 } as React.CSSProperties}>
      <rect x={c.start * 5 + 1.5} y={3} width={c.length * 5 - 3} height={20} rx={2} />
      <text x={c.start * 5 + 5} y={16.5}>{chordName(c)}</text>
    </g>)}
  </svg>;
}

/** `title` and `setKey` serve the SQ-4 scene browser: it names the scene and changes the key there. */
export function ProgressionBrowser({ chordKey, current, load, onClose, title, setKey }: { chordKey: number; current: number; load: (i: number) => void; onClose: () => void;
  title?: string; setKey?: (key: number) => void }) {
  const [family, setFamily] = useState('ALL');
  const [query, setQuery] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const entries = useMemo(() => PROGRESSIONS.map((p, i) => ({ p, i, family: progressionFamily(p), ...progressionChords(p, chordKey) })), [chordKey]);
  const shown = useMemo(() => {
    const q = query.trim().toUpperCase();
    return entries.filter(e => (family === 'ALL' || e.family === family)
      && (!q || `${e.p.name} ${e.p.mood} ${e.family} ${e.chords.map(chordName).join(' ')}`.toUpperCase().includes(q)));
  }, [entries, family, query]);
  useEffect(() => { list.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }); }, [current, shown]);
  const step = (d: number) => {
    if (!shown.length) return;
    const at = shown.findIndex(s => s.i === current);
    load(shown[at < 0 ? 0 : (at + d + shown.length) % shown.length].i);
  };
  const counts = useMemo(() => Object.fromEntries(PROGRESSION_FAMILIES.map(f => [f.name, entries.filter(e => e.family === f.name).length])), [entries]);
  return <div className="comp-browser" role="dialog" aria-label="Chord progression browser"
    onKeyDown={e => {
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); step(e.key === 'ArrowDown' ? 1 : -1); }
    }}>
    <div className="comp-browser-head">
      <h3>{title ? `SCENE CHORDS · ${title}` : 'CHORD PROGRESSIONS'} <span>{shown.length} / {PROGRESSIONS.length} · IN {PITCH_NAMES[chordKey]}</span></h3>
      {setKey && <label className="arp-field">KEY<select aria-label="Scene key" value={chordKey} onChange={e => setKey(+e.target.value)}>
        {PITCH_NAMES.map((n, i) => <option key={n} value={i}>{n}</option>)}
      </select></label>}
      <input autoFocus type="search" aria-label="Search chord progressions" placeholder="SEARCH MOOD, NUMERALS OR CHORD" value={query} onChange={e => setQuery(e.target.value)} />
      <button type="button" className="ns-btn" onClick={() => shown.length && load(shown[Math.floor(Math.random() * shown.length)].i)}>RANDOM</button>
      <button type="button" className="ns-btn nav-btn" onClick={onClose}>DONE</button>
    </div>
    <div className="comp-browser-body">
      <div className="comp-browser-families" aria-label="Progression family">
        {['ALL', ...PROGRESSION_FAMILIES.map(f => f.name)].map(f => <button key={f} type="button" aria-pressed={family === f} onClick={() => setFamily(f)}>
          {f}<span>{f === 'ALL' ? PROGRESSIONS.length : counts[f]}</span></button>)}
      </div>
      <div className="comp-browser-list" ref={list} role="listbox" aria-label="Chord progressions">
        {shown.map(({ p, i, chords, bars }) => <button key={i} type="button" role="option" aria-selected={i === current} onClick={() => load(i)} onDoubleClick={onClose}>
          <span className="comp-name">{p.mood}</span>
          <span className="comp-family">{p.name}</span>
          <ProgressionGrid chords={chords} />
          <span className="comp-meta">{bars} BAR{bars > 1 ? 'S' : ''} · {chords.length} CHORDS</span>
        </button>)}
        {!shown.length && <span className="arp-empty">No progression matches.</span>}
      </div>
    </div>
    <div className="comp-browser-foot">CLICK TO LOAD · ↑ ↓ STEP THROUGH THE LIST · {title ? 'LOADING REPLACES THE CHORDS OF EVERY LINKED TRACK' : 'LOADING REPLACES THE CHORD TRACK'} · ENTER / ESC CLOSES</div>
  </div>;
}
