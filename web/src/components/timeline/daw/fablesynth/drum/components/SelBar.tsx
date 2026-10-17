import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { patchOptions } from '../patches';
import { useDrumStore } from '../store';
import { PadPatchBrowser } from './browser/PadPatchBrowser';

export function SelBar() {
  const sel = useDrumStore((s) => s.sel);
  const padName = useDrumStore((s) => s.padNames[sel]);
  const patchValue = useDrumStore((s) => s.patchValue);
  const userPatches = useDrumStore((s) => s.userPatches);
  const stepPatch = useDrumStore((s) => s.stepPatch);
  const savePatch = useDrumStore((s) => s.savePatch);
  const browsing = useDrumStore((s) => s.browser === 'patch');
  const setBrowser = useDrumStore((s) => s.setBrowser);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');
  const cancelled = useRef(false);

  // The drawer belongs to this bar; leaving the edit page closes it.
  useEffect(() => () => {
    if (useDrumStore.getState().browser === 'patch') useDrumStore.getState().setBrowser(null);
  }, []);

  const currentPatch = patchOptions(userPatches).find((option) => option.value === patchValue)?.name ?? '—';

  const beginSave = () => {
    cancelled.current = false;
    setDraft(currentPatch === '—' ? '' : currentPatch);
    setNaming(true);
  };

  const commitSave = () => {
    setNaming(false);
    if (cancelled.current) return;
    const name = draft.trim().toUpperCase();
    if (!name) return;
    savePatch(name);
  };

  const onNameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    else if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur(); }
    e.stopPropagation();
  };

  return (
    <div className="dr-selbar">
      <span className="dr-led dr-led-a" aria-hidden="true" />
      <span className="dr-mini-head">PAD {String(sel + 1).padStart(2, '0')}</span>
      <span className="dr-sel-name">{padName}</span>
      <div className="dr-patchbar" aria-label="patch selection">
        <span className="dr-mini-head">PAD PATCH</span>
        <button className="pb-btn" aria-label="previous patch" onClick={() => stepPatch(-1)}>◂</button>
        <span className="dr-patchname">{currentPatch}</span>
        <button className="pb-btn" aria-label="next patch" onClick={() => stepPatch(1)}>▸</button>
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
            aria-label="Patch name"
          />
        ) : (
          <>
            <button
              className="pb-btn pb-save pb-browse"
              id="patch-browse"
              aria-expanded={browsing}
              onClick={() => setBrowser(browsing ? null : 'patch')}
            >BROWSE</button>
            <button className="pb-btn pb-save" onClick={beginSave}>SAVE</button>
          </>
        )}
      </div>
      {browsing && <PadPatchBrowser onClose={() => setBrowser(null)} />}
    </div>
  );
}
