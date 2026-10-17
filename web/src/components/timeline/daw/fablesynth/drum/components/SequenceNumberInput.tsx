import { useEffect, useId, useRef, useState } from 'react';
import { useDrumStore } from '../store';

/** Drafts never enter the sequence; one pointer hold is one undo transaction. */
export function SequenceNumberInput({ label, value, min, max, wrap = false, onChange }: {
  label: string; value: number; min: number; max: number; wrap?: boolean; onChange: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState('');
  const latest = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const change = useRef(onChange); change.current = onChange;
  useEffect(() => { latest.current = value; setDraft(String(value)); setError(''); }, [value]);
  const stop = () => { clearTimeout(timer.current); useDrumStore.getState().endSequenceGesture(); };
  useEffect(() => stop, []);
  const increment = (delta: number) => {
    let next = latest.current + delta;
    next = wrap ? ((next - min) % (max - min + 1) + max - min + 1) % (max - min + 1) + min : Math.max(min, Math.min(max, next));
    if (next !== latest.current) { latest.current = next; change.current(next); }
  };
  const commit = () => {
    if (!/^[+-]?\d+$/.test(draft) || Number(draft) < min || Number(draft) > max) {
      setError(`Enter ${min}–${max}`); return;
    }
    setError('');
    if (Number(draft) !== value) onChange(Number(draft));
  };
  return <div className="dr-sequence-number">
    <label htmlFor={id}>{label}</label>
    <div className="dr-number-controls">
      {[-1, 1].map(delta => <button key={delta} type="button" className={delta === 1 ? 'dr-number-plus' : ''}
        aria-label={`${delta < 0 ? 'Decrease' : 'Increase'} ${label}`}
        onPointerDown={e => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          useDrumStore.getState().beginSequenceGesture(); increment(delta);
          const repeat = () => { increment(delta); timer.current = setTimeout(repeat, 100); };
          timer.current = setTimeout(repeat, 400);
        }} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
        onClick={e => { if (e.detail === 0) increment(delta); }}>{delta < 0 ? '‹' : '›'}</button>)}
      <input id={id} aria-label={label} inputMode="numeric" value={draft} aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={e => { setDraft(e.target.value); setError(''); }} onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); setDraft(String(value)); setError(''); }
        }} />
    </div>
    {error && <span id={`${id}-error`} className="dr-poly-error" role="alert">{error}</span>}
  </div>;
}
