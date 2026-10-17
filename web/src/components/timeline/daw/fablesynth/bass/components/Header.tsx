import { useEffect, useRef, useState } from 'react';
import { ScopeView } from '../../components/displays/ScopeView';
import { patchOptions } from '../patches';
import { bassEngine, useBassStore } from '../store';
import { BassPatchBrowser } from './BassPatchBrowser';
import { BassKnob } from './BassKnob';
import { BassStepper } from './BassStepper';

export function Header() {
  const powered = useBassStore((s) => s.powered);
  const midiActive = useBassStore((s) => s.midiActive);
  const patchValue = useBassStore((s) => s.patchValue);
  const userPatches = useBassStore((s) => s.userPatches);
  const dirty = useBassStore((s) => s.dirty);
  const stepPatch = useBassStore((s) => s.stepPatch);
  const savePatch = useBassStore((s) => s.savePatch);
  const playing = useBassStore((s) => s.playing);
  const hosted = useBassStore((s) => s.hosted);
  const play = useBassStore((s) => s.play);
  const stop = useBassStore((s) => s.stop);

  const [browsing, setBrowsing] = useState(false);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const currentPatch = patchOptions(userPatches).find((option) => option.value === patchValue)?.name ?? 'UNTITLED';

  useEffect(() => {
    if (naming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [naming]);

  const startNaming = () => {
    setDraft(currentPatch === 'UNTITLED' ? '' : currentPatch);
    setNaming(true);
  };

  const commit = () => {
    const name = draft.trim().toUpperCase();
    setNaming(false);
    if (!name) return;
    savePatch(name);
  };

  return (
    <header className="top-bar bl-header">
      <div className="brand">FABLE<em>SYNTH</em><small>BL-1</small></div>
      <div className="preset-bar bl-patchbar" aria-label="patch selection">
        <span className="bl-patch-label">PATCH</span>
        <button className="pb-btn" aria-label="previous patch" onClick={() => stepPatch(-1)}>◂</button>
        {naming ? (
          <input
            ref={inputRef}
            className="bl-patchname-input"
            value={draft}
            maxLength={24}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => setNaming(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(); }
              else if (e.key === 'Escape') { e.preventDefault(); setNaming(false); }
              e.stopPropagation();
            }}
          />
        ) : (
          <span className="bl-patchname">
            {dirty && <span className="bl-patch-dirty" aria-hidden="true" />}
            {currentPatch}
          </span>
        )}
        <button className="pb-btn" aria-label="next patch" onClick={() => stepPatch(1)}>▸</button>
        {!hosted && (
          <button
            className="pb-btn pb-save pb-browse"
            id="patch-browse"
            aria-expanded={browsing}
            onClick={() => setBrowsing(!browsing)}
          >BROWSE</button>
        )}
        <button className="pb-btn pb-save" onClick={startNaming}>SAVE</button>
      </div>
      <div className="bl-voicemode">MONO · LAST-NOTE<br />SLIDES RIDE THE ENVS</div>
      <div className="hud bl-hud">
        <div className="hud-cell">
          {powered ? <ScopeView analyser={bassEngine.scopeAnalyser} accent="#4dff9e" /> : <canvas />}
          <span>SCOPE</span>
        </div>
      </div>
      <button
        className={`pb-btn bl-transport${playing ? ' active' : ''}`}
        type="button"
        aria-label={playing ? 'Stop sequencer' : 'Play sequencer'}
        aria-pressed={playing}
        onClick={playing ? stop : play}
      >
        {playing ? '■' : '▶'}
      </button>
      <div className="status bl-midi">
        <div className="status-row"><span className={`led${midiActive ? ' on' : ''}`} />MIDI</div>
        <div className="status-row bl-bpm"><BassStepper paramId="seq.bpm" accent="a" />BPM</div>
      </div>
      <div className="bl-master">
        <BassKnob paramId="master.swing" size="md" accent="n" />
        <BassKnob paramId="master.volume" size="md" accent="n" />
      </div>
      {browsing && !hosted && <BassPatchBrowser onClose={() => setBrowsing(false)} />}
    </header>
  );
}
