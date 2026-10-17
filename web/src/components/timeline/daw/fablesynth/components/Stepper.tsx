// Compact stepper for enum params: ◂ VALUE ▸

import { PARAMS } from '../params';
import { useStore } from '../store';

interface StepperProps {
  paramId: string;
  label?: string;
  accent?: string;
}

export function Stepper({ paramId, label, accent }: StepperProps) {
  const def = PARAMS[paramId];
  const value = useStore((s) => s.params[paramId]);
  const setParam = useStore((s) => s.setParam);
  // Table steppers extend their fixed procedural options with the live
  // user-table pool so imported/drawn tables are selectable.
  const userTables = useStore((s) => s.userTables);

  // Numeric (integer-range) mode: no option list, drive from the param's
  // numeric range, stepping by 1 with CLAMPING (not wrapping) at [min, max].
  if (def.curve === 'int' && !def.options) {
    const lo = def.min as number;
    const hi = def.max as number;
    const v = Math.min(hi, Math.max(lo, Math.round(value)));
    const stepN = (d: number) => setParam(paramId, Math.min(hi, Math.max(lo, v + d)));
    return (
      <div className="stepper" data-accent={accent}>
        {label ? <span className="st-label">{label}</span> : null}
        <button className="st-btn st-prev" aria-label="previous" onClick={() => stepN(-1)}>◂</button>
        <span className="st-value">{def.fmt ? def.fmt(v) : String(v)}</span>
        <button className="st-btn st-next" aria-label="next" onClick={() => stepN(1)}>▸</button>
      </div>
    );
  }

  const options = paramId.endsWith('.table')
    ? [...(def.options as string[]), ...userTables.map((u) => u.name)]
    : (def.options as string[]);
  const index = Math.min(options.length - 1, Math.max(0, value | 0));

  const step = (d: number) => {
    const n = options.length;
    setParam(paramId, (index + d + n) % n);
  };

  return (
    <div className="stepper" data-accent={accent}>
      {label ? <span className="st-label">{label}</span> : null}
      <button className="st-btn st-prev" aria-label="previous" onClick={() => step(-1)}>◂</button>
      <span className="st-value">{options[index]}</span>
      <button className="st-btn st-next" aria-label="next" onClick={() => step(1)}>▸</button>
    </div>
  );
}
