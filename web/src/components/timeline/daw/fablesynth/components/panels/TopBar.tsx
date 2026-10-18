import { useEffect, useRef, useState } from 'react';
import { Knob } from '../Knob';
import { ScopeView } from '../displays/ScopeView';
import { SpectrumView } from '../displays/SpectrumView';
import { ACCENTS } from '../../constants';
import { FACTORY_PRESETS } from '../../presets';
import { PresetBrowser } from '../presetBrowser/PresetBrowser';
import { useStore } from '../../store';

export function TopBar() {
  const powered = useStore((s) => s.powered);
  const midiActive = useStore((s) => s.midiActive);
  const voiceCount = useStore((s) => s.voiceCount);
  const userPresets = useStore((s) => s.userPresets);
  const presetValue = useStore((s) => s.presetValue);
  const dirty = useStore((s) => s.dirty);
  const loadPresetByValue = useStore((s) => s.loadPresetByValue);
  const stepPreset = useStore((s) => s.stepPreset);
  const savePreset = useStore((s) => s.savePreset);
  const engine = useStore((s) => s.engine);

  const [naming, setNaming] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (naming) { nameRef.current?.focus(); nameRef.current?.select(); }
  }, [naming]);

  const commitName = () => {
    const name = (nameRef.current?.value || '').trim().toUpperCase();
    setNaming(false);
    if (!name) return;
    savePreset(name);
  };

  const midiDim = !midiActive && !powered;

  return (
    <header className="top-bar wt-top-bar">
      <div className="brand">FABLE<em>SYNTH</em><small>WT‑1</small></div>
      <div className="preset-bar">
        <button className="pb-btn fs-preset-prev" aria-label="previous preset" onClick={() => stepPreset(-1)} disabled={naming}>◂</button>
        {naming ? (
          <input
            ref={nameRef}
            className="pb-name-input"
            aria-label="preset name"
            defaultValue=""
            placeholder="PRESET NAME"
            maxLength={24}
            onKeyDown={(e) => {
              // Stop the global computer-keyboard handler from treating
              // typed characters as note-play while this field is focused.
              e.stopPropagation();
              if (e.key === 'Enter') { e.preventDefault(); commitName(); }
              else if (e.key === 'Escape') { e.preventDefault(); setNaming(false); }
            }}
            onBlur={() => setNaming(false)}
          />
        ) : (
          <select
            className="fs-preset-select"
            aria-label="preset"
            value={presetValue}
            onChange={(e) => {
              loadPresetByValue(e.target.value);
              // Release focus so the computer keyboard plays notes instead of
              // navigating the select (which swallows key events while focused).
              e.currentTarget.blur();
            }}
          >
            {presetValue === '' && <option value="" disabled>CUSTOM</option>}
            <optgroup label="FACTORY">
              {FACTORY_PRESETS.map((p, i) => (
                <option key={'f' + i} value={'f' + i}>{p.name}</option>
              ))}
            </optgroup>
            {userPresets.length ? (
              <optgroup label="USER">
                {userPresets.map((p, i) => (
                  <option key={'u' + i} value={'u' + i}>{p.name}</option>
                ))}
              </optgroup>
            ) : null}
          </select>
        )}
        {!naming && dirty && <span className="pb-dirty" aria-label="unsaved changes" title="unsaved changes" />}
        <button className="pb-btn fs-preset-next" aria-label="next preset" onClick={() => stepPreset(1)} disabled={naming}>▸</button>
        {naming ? (
          <>
            <button className="pb-btn pb-save" onClick={commitName}>OK</button>
            <button className="pb-btn" onClick={() => setNaming(false)}>✕</button>
          </>
        ) : (
          <>
            <button
              className="pb-btn pb-save pb-browse fs-preset-browse"
              aria-expanded={browsing}
              onClick={() => setBrowsing(!browsing)}
            >BROWSE</button>
            <button className="pb-btn pb-save fs-preset-save" onClick={() => setNaming(true)}>SAVE</button>
          </>
        )}
      </div>
      {browsing && <PresetBrowser onClose={() => setBrowsing(false)} />}
      <div className="hud">
        <div className="hud-cell">
          <ScopeView analyser={powered ? engine.scopeAnalyser : null} accent={ACCENTS.a} />
          <span>SCOPE</span>
        </div>
        <div className="hud-cell">
          <SpectrumView analyser={powered ? engine.specAnalyser : null} accent={ACCENTS.b} />
          <span>SPECTRUM</span>
        </div>
      </div>
      <div className={`status${midiDim ? ' dim' : ''}`}>
        <div className="status-row"><span className={`led fs-midi-led${midiActive ? ' on' : ''}`} />MIDI</div>
        <div className="status-row"><span className="fs-voice-count">{voiceCount}</span>VOICES</div>
      </div>
      <div className="fs-master-knob"><Knob paramId="master.volume" size="md" accent="n" /></div>
    </header>
  );
}
