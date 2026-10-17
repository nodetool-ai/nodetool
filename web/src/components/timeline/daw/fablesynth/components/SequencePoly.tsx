import { useEffect, useId, useRef, useState } from 'react';
import type { SequenceRhythm } from '../shared/sequenceRhythm';
import './sequencePoly.css';

export function SequencePoly({ rhythm, clipKey, onChange, onUndo, onRedo }: {
  rhythm: SequenceRhythm; clipKey?: string; onChange: (patch: Partial<SequenceRhythm>) => void; onUndo: () => void; onRedo: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(rhythm.enabled);
  // The hosted editors reuse this component across clips: re-sync when the clip
  // changes or POLY turns on, but leave a manual collapse alone otherwise.
  const prev = useRef({ clipKey, enabled: rhythm.enabled });
  useEffect(() => {
    const p = prev.current;
    if (p.clipKey !== clipKey) setOpen(rhythm.enabled);
    else if (rhythm.enabled && !p.enabled) setOpen(true);
    prev.current = { clipKey, enabled: rhythm.enabled };
  }, [clipKey, rhythm.enabled]);
  const { enabled, mode, steps, rotation, cycleBeats } = rhythm;
  const summary = !enabled ? 'OFF' : mode === 'grid' ? `GRID ${steps}` : `FIT ${steps}/${cycleBeats / 4}B`;
  return <div className={`sequence-poly${enabled ? ' on' : ''}`} data-sequence-controls onKeyDown={e => {
      e.stopPropagation();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? onRedo() : onUndo(); }
    }}>
    <button type="button" className="sequence-poly-disclosure" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      POLY <span>{summary}</span> {open ? '▴' : '▾'}
    </button>
    {open && <div id={id} className="sequence-poly-controls">
      <button type="button" className="sequence-poly-power" aria-label="Enable sequence POLY" aria-pressed={enabled}
        onClick={() => onChange({ enabled: !enabled })}>{enabled ? 'ON' : 'OFF'}</button>
      <fieldset><legend>MODE</legend><div className="sequence-poly-segment">
        {(['grid', 'fit'] as const).map(value => <label key={value}><input type="radio" name={`${id}-mode`} checked={mode === value}
          onChange={() => onChange({ mode: value })} /><span>{value.toUpperCase()}</span></label>)}
      </div></fieldset>
      <NumberControl label="STEPS" value={steps} min={1} max={16} onChange={value => onChange({ steps: value })} />
      {mode === 'fit' && <fieldset><legend>CYCLE</legend><div className="sequence-poly-segment">
        {([4, 8] as const).map(value => <label key={value}><input type="radio" name={`${id}-cycle`} checked={cycleBeats === value}
          onChange={() => onChange({ cycleBeats: value })} /><span>{value / 4} {value === 4 ? 'BAR' : 'BARS'}</span></label>)}
      </div></fieldset>}
      <NumberControl label="ROTATE" value={rotation} min={0} max={steps - 1} wrap onChange={value => onChange({ rotation: value })} />
      <div className="sequence-poly-history"><button type="button" aria-label="Undo sequence edit" onClick={onUndo}>↶</button><button type="button" aria-label="Redo sequence edit" onClick={onRedo}>↷</button></div>
      <span className="sequence-poly-explanation">BAR 1 · FIRST {steps} CELLS · {mode === 'fit' ? 'EQUAL SLOTS · STRAIGHT' : '1/16 GRID · SWING'}</span>
    </div>}
  </div>;
}
function NumberControl({ label, value, min, max, wrap, onChange }: {
  label: string; value: number; min: number; max: number; wrap?: boolean; onChange: (v: number) => void;
}) {
  const step = (d: number) => {
    const n = value + d;
    onChange(wrap ? (n < min ? max : n > max ? min : n) : Math.max(min, Math.min(max, n)));
  };
  return <fieldset><legend>{label}</legend><div className="stepper">
    <button type="button" className="st-btn" aria-label={`Decrease ${label}`} disabled={!wrap && value === min} onClick={() => step(-1)}>◂</button>
    <output className="st-value" aria-label={label}>{value}</output>
    <button type="button" className="st-btn" aria-label={`Increase ${label}`} disabled={!wrap && value === max} onClick={() => step(1)}>▸</button>
  </div></fieldset>;
}
