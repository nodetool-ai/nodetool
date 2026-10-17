// SQ-4 top bar: combined play/stop transport, launch quantize, beat dots +
// bar/BPM readout from the shared
// timebase, master scope and the swing/volume master knobs.

import { useState } from 'react';
import { pad2 } from '../model';
import { useSeqStore } from '../store';
import { Scope } from './Scope';
import { SeqKnob } from './SeqKnob';
import { FACTORY_SESSION_PRESETS } from '../sessionPresets';
import { SessionLibraryBrowser } from './SessionLibraryBrowser';
import { TransportGlyph } from './TransportGlyph';

export function Header() {
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const playing = useSeqStore((s) => s.playing);
  const powered = useSeqStore((s) => s.powered);
  const beat = useSeqStore((s) => s.beat);
  const bar = useSeqStore((s) => s.bar);
  const bpm = useSeqStore((s) => s.session.bpm);
  const quant = useSeqStore((s) => s.quant);
  const swing = useSeqStore((s) => s.swing);
  const masterVol = useSeqStore((s) => s.masterVol);
  const masterFxOpen = useSeqStore((s) => s.masterFxOpen);
  const sessionName = useSeqStore((s) => s.session.name);
  const { toggleTransport, cycleQuant, setSwing, setMasterVol, loadSessionPreset, startTour, toggleMasterFx } = useSeqStore.getState();

  return (
    <header className="sq-top">
      <div className="sq-logo">
        FABLE<span className="sq-logo-hot">SEQ</span>
        <span className="sq-logo-model">SQ-4</span>
      </div>

      <div className="sq-transport">
        <button
          className={`sq-play${playing ? ' on' : ''}`}
          onClick={toggleTransport}
          disabled={!powered}
          title={playing ? 'Stop sequencer' : 'Start sequencer'}
          aria-label={playing ? 'Stop sequencer' : 'Start sequencer'}
        >
          <TransportGlyph kind={playing ? 'stop' : 'play'} />
        </button>
      </div>

      <label className="sq-session-preset">
        <span>SESSION</span>
        <select value={FACTORY_SESSION_PRESETS.findIndex((preset) => preset.name === sessionName)} onChange={(e) => loadSessionPreset(Number(e.target.value))}>
          <option value={-1}>CUSTOM · {sessionName}</option>
          {FACTORY_SESSION_PRESETS.map((preset, i) => <option key={preset.name} value={i}>{preset.family} · {preset.name}</option>)}
        </select>
      </label>

      <button className="sq-sessions-open" onClick={() => setSessionsOpen(true)} title="Saved sessions">SESSIONS</button>
      <button className={`sq-master-fx-toggle${masterFxOpen ? ' on' : ''}`} onClick={() => {
        const st = useSeqStore.getState();
        if (!st.masterFxOpen && st.focus) st.exitFocus();
        toggleMasterFx();
      }} aria-pressed={masterFxOpen} title="Show master effects">MASTER FX</button>
      {sessionsOpen && <SessionLibraryBrowser onClose={() => setSessionsOpen(false)} />}

      <div className="sq-quant">
        <span className="sq-quant-tag">QUANT</span>
        <button className="sq-quant-step" onClick={() => cycleQuant(-1)}>◂</button>
        <span className="sq-quant-val">{quant}</span>
        <button className="sq-quant-step" onClick={() => cycleQuant(1)}>▸</button>
      </div>

      <div className="sq-clock">
        <div className="sq-beats">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`sq-beat${playing && beat === i ? ' on' : ''}`} />
          ))}
        </div>
        <div className="sq-clock-line">
          BAR <b>{pad2(bar)}</b> · <em>{bpm}</em> BPM
        </div>
      </div>

      <div className="sq-top-right">
        <Scope />
      </div>
      <div className="sq-master-knobs">
        <SeqKnob value={swing} onChange={setSwing} label="SWING" size="sm" defaultValue={0} />
        <SeqKnob value={masterVol} onChange={setMasterVol} label="VOL" size="sm" defaultValue={0.75} />
      </div>
      <button
        className="sq-help"
        onClick={startTour}
        disabled={!powered}
        title="Quick tour — what to click to start the song, launch scenes, edit devices and load other songs"
        aria-label="Open quick tour"
      >
        ?
      </button>
    </header>
  );
}
