import { useRef, useState, type KeyboardEvent } from 'react';
import { ScopeView } from '../../components/displays/ScopeView';
import { DrumKnob } from './DrumKnob';
import { DrumStepper } from './DrumStepper';
import { KitBrowser } from './browser/KitBrowser';
import { drumEngine, kitOptions, useDrumStore } from '../store';

export function Header() {
  const powered = useDrumStore((s) => s.powered);
  const midiActive = useDrumStore((s) => s.midiActive);
  const kitValue = useDrumStore((s) => s.kitValue);
  const userKits = useDrumStore((s) => s.userKits);
  const kitDirty = useDrumStore((s) => s.kitDirty);
  const stepKit = useDrumStore((s) => s.stepKit);
  const saveKit = useDrumStore((s) => s.saveKit);
  const playing = useDrumStore((s) => s.playing);
  const play = useDrumStore((s) => s.play);
  const stop = useDrumStore((s) => s.stop);
  const hosted = useDrumStore((s) => s.hosted);
  const browsing = useDrumStore((s) => s.browser === 'kit');
  const setBrowser = useDrumStore((s) => s.setBrowser);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');
  const cancelled = useRef(false);

  const currentKit = kitOptions(userKits).find((option) => option.value === kitValue)?.name ?? 'UNTITLED';

  const beginSave = () => {
    cancelled.current = false;
    setDraft(currentKit === 'UNTITLED' ? '' : currentKit);
    setNaming(true);
  };

  const commitSave = () => {
    setNaming(false);
    if (cancelled.current) return;
    const name = draft.trim().toUpperCase();
    if (!name) return;
    saveKit(name);
  };

  const onNameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    else if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur(); }
    e.stopPropagation();
  };

  return (
    <header className="top-bar dr-header">
      <div className="brand">FABLE<em>SYNTH</em><small>DR-1</small></div>
      <div className="preset-bar dr-kitbar" aria-label="kit selection">
        <span className="dr-mini-head">KIT</span>
        <button className="pb-btn" aria-label="previous kit" onClick={() => stepKit(-1)}>◂</button>
        <span className="dr-kitname">
          {currentKit}
          {kitDirty && !naming && <span className="dr-dirty-dot" aria-label="unsaved changes" title="unsaved changes" />}
        </span>
        <button className="pb-btn" aria-label="next kit" onClick={() => stepKit(1)}>▸</button>
        {naming ? (
          <input
            className="dr-name-input"
            value={draft}
            maxLength={24}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitSave}
            onKeyDown={onNameKeyDown}
            aria-label="Kit name"
          />
        ) : (
          <>
            {!hosted && (
              <button
                className="pb-btn pb-save pb-browse"
                id="kit-browse"
                aria-expanded={browsing}
                onClick={() => setBrowser(browsing ? null : 'kit')}
              >BROWSE</button>
            )}
            <button className="pb-btn pb-save" onClick={beginSave}>SAVE</button>
          </>
        )}
      </div>
      {browsing && !hosted && <KitBrowser onClose={() => setBrowser(null)} />}
      <div className="hud dr-hud">
        <div className="hud-cell">
          {powered ? <ScopeView analyser={drumEngine.scopeAnalyser} accent="#4de8ff" /> : <canvas />}
          <span>SCOPE</span>
        </div>
      </div>
      <div className="status dr-midi">
        <div className="status-row"><span className={`led${midiActive ? ' on' : ''}`} />MIDI</div>
      </div>
      <div className="dr-master">
        <div className="dr-tempo">
          <button
            className={`pb-btn dr-transport${playing ? ' active' : ''}`}
            type="button"
            aria-label={playing ? 'Stop sequencer' : 'Play sequencer'}
            aria-pressed={playing}
            onClick={playing ? stop : play}
          >
            {playing ? '■' : '▶'}
          </button>
          <DrumStepper paramId="seq.bpm" accent="a" label="SYNC" />
        </div>
        <DrumKnob paramId="master.swing" size="xs" accent="n" />
        <DrumKnob paramId="master.volume" size="xs" accent="n" />
      </div>
    </header>
  );
}
