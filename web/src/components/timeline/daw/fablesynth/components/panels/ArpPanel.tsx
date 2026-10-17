import { useState, type ReactNode } from 'react';
import { arpSequence, arpStepPos, noteName, type ArpInput, type ArpOrder, type ArpState } from '../../arp';
import { chordName } from '../../chords';
import { COMP_ROWS, COMP_VOICINGS, compSequence, STRUM_DIRS, STRUM_MAX_MS } from '../../comp';
import { COMP_LIBRARY, compLibraryIndex } from '../../compLibrary';
import { CompBrowser, loadCompEntry, VOICING_NAMES } from './CompBrowser';
import { ChordTrack, type ChordLink } from './ChordTrack';
import './arp.css';

/** A row of mutually exclusive buttons. */
function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string, string?][]; onChange: (v: T) => void }) {
  return <div className="arp-seg" role="group" aria-label={label}>
    {options.map(([v, text, title]) => <button key={String(v)} type="button" title={title} aria-pressed={v === value} onClick={() => onChange(v)}>{text}</button>)}
  </div>;
}
/** A numbered panel section: musical decisions read top to bottom. */
function Card({ n, title, tools, children, className = '' }: { n: number; title: string; tools?: ReactNode; children?: ReactNode; className?: string }) {
  return <div className={`arp-card ${className}`}>
    <div className="arp-card-head"><span className="arp-card-no">{n}</span><h3>{title}</h3>{tools}</div>
    {children}
  </div>;
}
function Slider({ label, value, text, min, max, reset, onChange }: { label: string; value: number; text: string; min: number; max: number; reset: number; onChange: (v: number) => void }) {
  return <label className="arp-knob"><span>{label}<output>{text}</output></span>
    <input aria-label={label} type="range" min={min} max={max} value={value} onDoubleClick={() => onChange(reset)} onChange={e => onChange(+e.target.value)} />
  </label>;
}

const RATES: [number, string][] = [[1, '1/4'], [.75, '1/8 DOTTED'], [.5, '1/8'], [1 / 3, '1/8 TRIPLET'], [.375, '1/16 DOTTED'], [.25, '1/16'], [1 / 6, '1/16 TRIPLET'], [.125, '1/32']];
const VOICE_TITLES: Record<string, string> = { TOP: 'Highest chord note', MID: 'Chord notes between the lowest and highest', LOW: 'Lowest chord note', BASS: 'Chord root, one octave below' };

export interface ArpPanelProps {
  a: ArpState; keys: number[]; update: (patch: Partial<ArpState>) => void;
  playing: boolean; current: number; play: () => void; stop: () => void; clear: () => void;
  bpm: number; swing: number; setParam: (id: string, value: number) => void;
  /** The tab this panel fills; the tab LEDs pick which mode plays. */
  mode: 'arp' | 'chords'; active: boolean; bass?: boolean;
  hosted?: boolean; queued?: boolean;
  /** Sequence length in bars; the chord track spans it. */
  bars?: number; setBars?: (bars: number) => void;
  /** SQ-4: share the chord track with the scene's other linked clips. */
  chordLink?: ChordLink;
}
export function ArpPanel({ a, keys, update, playing, current, play, stop, clear, bpm, swing, setParam, mode, active, bass = false, hosted = false, queued = false, bars = 1, setBars, chordLink }: ArpPanelProps) {
  const swingParam = bass ? 'master.swing' : 'seq.swing';
  const [editing, setEditing] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [octave, setOctave] = useState(bass ? 2 : 3);
  const notes = a.input === 'keys' ? keys : a.notes;
  const chordMode = a.input === 'chords';
  // Comping is a WT-1 feature: BL-1 is monophonic.
  const comp = mode === 'chords' && !bass;
  const running = playing && active;
  const source = chordMode ? a : { ...a, input: 'stored' as const };
  const compSeq = comp ? compSequence(source, notes, bars) : null;
  const cycle = compSeq ? compSeq.notes : arpSequence({ ...source, style: 'arp' }, notes, bars);
  // The worklet step runs over the whole chord cycle; the lanes repeat every 16.
  const step = running && current >= 0 ? current % 16 : -1;
  const page = running && current >= 0 ? Math.floor(current / 16) % (cycle.length / 16) : 0;
  const preview = cycle.slice(page * 16, page * 16 + 16);
  const stacks = compSeq ? compSeq.stack.slice(page * 16, page * 16 + 16) : [];
  const preset = comp ? compLibraryIndex(a) : -1;
  const stepPreset = (d: number) => update(loadCompEntry(COMP_LIBRARY[(Math.max(preset, d > 0 ? -1 : 0) + d + COMP_LIBRARY.length) % COMP_LIBRARY.length]));
  const ready = chordMode ? a.chords.length > 0 : notes.length > 0;
  const sounding = step >= 0 && (comp || a.hits[step]) ? preview[step] : -1;
  const toggleNote = (n: number) => update({ notes: a.notes.includes(n) ? a.notes.filter(k => k !== n) : [...a.notes, n] });
  const status = !active ? 'OFF · SWITCH ON WITH THE TAB LED' : queued ? 'QUEUED' : !ready ? chordMode ? 'DRAW CHORDS' : 'WAITING FOR NOTES' : playing ? 'RUNNING' : 'READY';
  // The chord under each step of the shown page, named where it changes.
  const stepChords = chordMode ? preview.map((_, i) => {
    const pos = arpStepPos(a.rate, bars, page * 16 + i) + 1e-6;
    return a.chords.find(c => pos >= c.start && pos < Math.min(bars * 16, c.start + c.length));
  }) : [];
  const playingNotes = comp && step >= 0 ? [...(stacks[step] ?? [])].sort((x, y) => x - y) : [];

  const stepNumbers = <div className="arp-row arp-steps" aria-hidden="true"><span />
    {preview.map((_, i) => <span key={i} className={`${step === i ? 'current' : ''}${i % 4 === 0 ? ' beat' : ''}`}>{i % 4 === 0 ? i / 4 + 1 : '·'}</span>)}
  </div>;
  const lane = (label: string, values: boolean[], key: 'hits' | 'accents' | 'ties' | 'slides', glyph: string, title: string, kind = '') =>
    <div className={`arp-row arp-lane ${kind}`} key={key}><span title={title}>{label}</span>
      {values.map((on, i) => <button key={i} type="button" title={title} aria-label={`${label} step ${i + 1}`} aria-pressed={on}
        className={`${on ? 'on' : ''}${step === i ? ' current' : ''}${i % 4 === 0 ? ' beat' : ''}`}
        onClick={() => update({ [key]: values.map((v, j) => j === i ? !v : v) })}>{on ? glyph : ''}</button>)}
    </div>;

  // Comp voice grid: dots strike a voice, bars show it held through ties.
  let held = 0;
  const heldMasks = a.comp.map((m, i) => (held = a.ties[i] ? held : m));
  const compGrid = <div className="arp-grid" aria-label="Comp pattern">
    {chordMode && <div className="arp-row arp-chords" aria-hidden="true"><span>CHORD</span>
      {stepChords.map((c, i) => <span key={i} className={c && c !== stepChords[i - 1] ? 'start' : ''} style={c ? { '--hue': c.root * 30 } as React.CSSProperties : undefined}>
        {c && c !== stepChords[i - 1] ? chordName(c) : ''}</span>)}
    </div>}
    {stepNumbers}
    {COMP_ROWS.map(([label, bit]) => <div className="arp-row arp-voice" key={label}><span title={VOICE_TITLES[label]}>{label}</span>
      {a.comp.map((m, i) => {
        const tied = a.ties[i], strike = !tied && !!(m & bit), hold = tied && !!(heldMasks[i] & bit);
        const next = (i + 1) % 16, continues = (strike || hold) && a.ties[next] && !!(heldMasks[next] & bit) && next !== 0;
        return <button key={i} type="button" title={VOICE_TITLES[label]} aria-label={`${label} voice step ${i + 1}`} aria-pressed={strike}
          className={`${strike ? 'on' : hold ? 'held' : ''}${continues ? ' continues' : ''}${a.accents[i] && strike ? ' accent' : ''}${step === i ? ' current' : ''}${i % 4 === 0 ? ' beat' : ''}`}
          onClick={() => update(tied
            // A click on a held step strikes there instead, keeping the other held voices.
            ? { ties: a.ties.map((v, j) => j === i ? false : v), comp: a.comp.map((v, j) => j === i ? heldMasks[i] ^ bit : v) }
            : { comp: a.comp.map((v, j) => j === i ? v ^ bit : v) })} />;
      })}
    </div>)}
    <div className="arp-divider" />
    {lane('HOLD', a.ties, 'ties', '⁀', 'Hold the previous chord through this step; a chord change strikes the new chord', 'hold')}
    {lane('ACCENT', a.accents, 'accents', '●', 'Play this step louder', 'accent')}
  </div>;

  const arpGrid = <>
    <div className="arp-display" aria-label="Generated phrase preview">
      {(() => {
        const used = preview.filter(n => n >= 0);
        const low = Math.min(...used, bass ? 36 : 48), high = Math.max(...used, low + 12);
        return <>
          <div className="arp-register"><span>{noteName(high)}</span><span>{noteName(low)}</span></div>
          <div className="arp-phrase">{preview.map((n, i) => <div key={i} className={`arp-column${step === i ? ' current' : ''}${i % 4 === 0 ? ' beat' : ''}`}>
            {n >= 0 && <div className={`arp-generated${a.hits[i] ? '' : ' rest'}${a.accents[i] ? ' accented' : ''}${bass && a.slides?.[i] && a.hits[i] && a.hits[(i + 15) % 16] ? ' slide' : ''}`} style={{ bottom: `${8 + (n - low) / (high - low) * 66}%`, width: `${Math.max(12, a.gate * 90)}%` }}><span>{noteName(n)}</span></div>}
          </div>)}</div>
        </>;
      })()}
    </div>
    <div className="arp-grid">
      {stepNumbers}
      {lane('PLAY', a.hits, 'hits', '●', 'Play or rest on this step')}
      {lane('ACCENT', a.accents, 'accents', '●', 'Play this step louder', 'accent')}
      {bass && a.slides && lane('SLIDE', a.slides, 'slides', '↗', 'Glide from the previous note; rests break slides')}
    </div>
  </>;

  return <section className={`panel ns-section arp-panel${bass ? ' arp-bass' : ''}`} style={{ gridArea: 'seq' }} data-accent="a">
    <div className="arp-top">
      {hosted && <button className={`pb-btn ns-transport${playing ? ' active' : ''}`} type="button" aria-label={playing || queued ? 'Stop arp clip' : 'Launch arp clip'} aria-pressed={playing} onClick={playing || queued ? stop : play}>{playing || queued ? '■' : '▶'}</button>}
      <h2>{comp ? 'CHORD COMPING' : 'ARPEGGIATOR'}</h2>
      <span className="arp-status">{status}<span className={running ? 'arp-led on' : 'arp-led'} /></span>
      {hosted ? <span className="arp-tempo">SQ-4 CLOCK · {bpm} BPM</span> : <label className="arp-tempo">BPM <input aria-label="Arpeggiator tempo" type="number" min="60" max="200" value={bpm} onChange={e => setParam('seq.bpm', Math.max(60, Math.min(200, +e.target.value || 120)))} /></label>}
    </div>

    <Card n={1} title="NOTES" tools={<>
      <Segmented<ArpInput> label="Arpeggiator input" value={a.input} onChange={input => update({ input })} options={[
        ['stored', 'NOTE LIST', 'Pick a fixed set of notes'],
        ...(hosted ? [] : [['keys', 'PLAYED KEYS', 'Use the keys you hold on MIDI or the keyboard'] as [ArpInput, string, string]]),
        ['chords', 'CHORD TRACK', 'Draw a chord progression']]} />
      <span className="arp-hint">{chordMode ? `${bars} BAR${bars > 1 ? 'S' : ''}, LOOPED` : a.input === 'keys' ? a.latch ? 'LATCHED' : 'HOLD KEYS TO PLAY' : ''}</span>
    </>}>
      {chordMode ? <ChordTrack a={a} update={update} bars={bars} setBars={setBars} link={chordLink} pos={running && current >= 0 ? arpStepPos(a.rate, bars, current) : -1} /> : <>
        <div className="arp-source">
          <div className="arp-note-pool" aria-label="Arpeggiator notes">
            {notes.map(n => <span key={n} className={`arp-note${sounding === n || playingNotes.includes(n) ? ' sounding' : ''}`}>{noteName(n)}</span>)}
            {!notes.length && <span className="arp-empty">{a.input === 'keys' ? 'Play a chord on MIDI or the keyboard below.' : 'Add notes to begin.'}</span>}
          </div>
          {a.input !== 'keys' ? <button className="ns-btn" aria-expanded={editing} onClick={() => setEditing(!editing)}>{editing ? 'DONE' : 'EDIT NOTES'}</button> : <>
            <button className="ns-btn" aria-pressed={a.latch} onClick={() => update({ latch: !a.latch })}>LATCH</button>
            <button className="ns-btn" disabled={!keys.length} onClick={() => update({ notes: [...keys], input: 'stored' })}>KEEP AS NOTE LIST</button>
            <button className="ns-btn" onClick={clear}>CLEAR</button>
          </>}
        </div>
        {editing && a.input === 'stored' && <div className="arp-editor">
          <div className="arp-octave"><button aria-label="Lower keyboard octave" disabled={octave <= 1} onClick={() => setOctave(o => o - 1)}>−</button><span>OCT {octave}</span><button aria-label="Raise keyboard octave" disabled={octave >= 6} onClick={() => setOctave(o => o + 1)}>+</button></div>
          <div className="arp-keys">{Array.from({ length: 12 }, (_, i) => {
            const n = (octave + 1) * 12 + i;
            return <button key={i} type="button" className={[1, 3, 6, 8, 10].includes(i) ? 'sharp' : ''} aria-label={`Include ${noteName(n)}`} aria-pressed={a.notes.includes(n)} onClick={() => toggleNote(n)}>{noteName(n)}</button>;
          })}</div>
          <button className="ns-btn" onClick={() => update({ notes: [] })}>CLEAR</button>
        </div>}
      </>}
    </Card>

    <Card n={2} title="PATTERN" className="arp-pattern" tools={comp ? <>
      <div className="arp-pattern-pick">
        <button type="button" aria-label="Previous comp pattern" title="Previous pattern" onClick={() => stepPreset(-1)}>‹</button>
        <button type="button" className="pattern-name" aria-label="Browse comp patterns" title="Browse 512 patterns by style" onClick={() => setBrowsing(true)}>
          <strong>{preset < 0 ? 'CUSTOM PATTERN' : COMP_LIBRARY[preset].groove}</strong>
          {preset >= 0 && <em>{COMP_LIBRARY[preset].variation !== 'ORIGINAL' ? COMP_LIBRARY[preset].variation : COMP_LIBRARY[preset].family}</em>}
          <span className="browse">BROWSE</span>
        </button>
        <button type="button" aria-label="Next comp pattern" title="Next pattern" onClick={() => stepPreset(1)}>›</button>
      </div>
      <span className="arp-now">{playingNotes.length ? playingNotes.map(noteName).join(' · ') : 'CLICK THE GRID TO ADD OR REMOVE NOTES'}</span>
    </> : <>
      <label className="arp-field">ORDER<select aria-label="Arpeggiator order" value={a.order} onChange={e => update({ order: e.target.value as ArpOrder })}>
        <option value="up">↑ UP</option><option value="down">↓ DOWN</option><option value="updown">↕ UP / DOWN</option><option value="played">AS PLAYED</option><option value="random">RANDOM</option>
      </select></label>
      <label className="arp-field">RANGE<select aria-label="Arpeggiator octaves" value={a.octaves} onChange={e => update({ octaves: +e.target.value })}><option value={1}>1 OCTAVE</option><option value={2}>2 OCTAVES</option><option value={3}>3 OCTAVES</option></select></label>
      {a.order === 'random' && <button className="ns-btn" onClick={() => update({ seed: a.seed + 1 })}>NEW SEED</button>}
      <span className="arp-hint">{chordMode ? `${cycle.length} STEPS · RESTARTS ON EACH CHORD` : '16 STEPS'}</span>
    </>}>
      {comp ? compGrid : arpGrid}
    </Card>

    <Card n={3} title="FEEL" className="arp-feel" tools={<div className="arp-feel-controls">
      <label className="arp-field">RATE<select aria-label="Arpeggiator rate" value={a.rate} onChange={e => update({ rate: +e.target.value })}>
        {RATES.map(([v, t]) => <option key={t} value={v}>{t}</option>)}
      </select></label>
      <Slider label="GATE" value={Math.round(a.gate * 100)} text={`${Math.round(a.gate * 100)}%`} min={5} max={95} reset={65} onChange={v => update({ gate: v / 100 })} />
      <Slider label={hosted ? 'GLOBAL SWING' : 'SWING'} value={Math.round(swing * 100)} text={`${Math.round(swing * 100)}%`} min={0} max={100} reset={0} onChange={v => setParam(swingParam, v / 100)} />
      {comp && <>
        <Slider label="STRUM" value={a.strum} text={a.strum ? `${a.strum} MS` : 'OFF'} min={0} max={STRUM_MAX_MS} reset={0} onChange={strum => update({ strum })} />
        <span className="arp-field">STROKE</span><Segmented label="Strum direction" value={a.strumDir} onChange={strumDir => update({ strumDir })}
          options={STRUM_DIRS.map(d => [d, d === 'up' ? '↑' : d === 'down' ? '↓' : '↕', d === 'up' ? 'Strum low to high' : d === 'down' ? 'Strum high to low' : 'Alternate like a guitarist'])} />
        <span className="arp-field">VOICING</span><Segmented label="Comp voicing" value={a.voicing} onChange={voicing => update({ voicing })}
          options={COMP_VOICINGS.map(v => [v, VOICING_NAMES[v], v === 'close' ? 'Chord notes packed together' : v === 'open' ? 'Every other note raised an octave' : 'Inner notes dropped an octave'])} />
      </>}
    </div>} />

    {browsing && comp && <CompBrowser a={a} update={update} onClose={() => setBrowsing(false)} />}
  </section>;
}
