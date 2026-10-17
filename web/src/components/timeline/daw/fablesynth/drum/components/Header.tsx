import { useRef, useState, type KeyboardEvent } from 'react';
import { ScopeView } from '../../components/displays/ScopeView';
import { DrumKnob } from './DrumKnob';
import { KitBrowser } from './browser/KitBrowser';
import { kitOptions, useDrumStore } from '../dr1Store';

export function Header() {
  const powered = useDrumStore((s) => s.powered);
  const kitValue = useDrumStore((s) => s.kitValue);
  const userKits = useDrumStore((s) => s.userKits);
  const kitDirty = useDrumStore((s) => s.kitDirty);
  const stepKit = useDrumStore((s) => s.stepKit);
  const saveKit = useDrumStore((s) => s.saveKit);
  const analyser = useDrumStore((s) => s.analyser);
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
            <button
              className="pb-btn pb-save pb-browse"
              aria-expanded={browsing}
              onClick={() => setBrowser(browsing ? null : 'kit')}
            >BROWSE</button>
            <button className="pb-btn pb-save" onClick={beginSave}>SAVE</button>
          </>
        )}
      </div>
      {browsing && <KitBrowser onClose={() => setBrowser(null)} />}
      <div className="hud dr-hud">
        <div className="hud-cell">
          {powered && analyser ? <ScopeView analyser={analyser} accent="#4de8ff" /> : <canvas />}
          <span>SCOPE</span>
        </div>
      </div>
      <div className="status dr-midi">
        <div className="status-row"><span className={`led${powered ? ' on' : ''}`} />AUDIO</div>
      </div>
      <div className="dr-master">
        <DrumKnob paramId="master.volume" size="xs" accent="n" />
      </div>
    </header>
  );
}
