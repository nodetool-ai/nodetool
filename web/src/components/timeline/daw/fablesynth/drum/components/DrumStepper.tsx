import { useTranslation } from 'react-i18next';
import { DRUM_PARAMS } from '../params';
import { useDrumStore } from '../dr1Store';

interface DrumStepperProps {
  paramId: string;
  label?: string;
  accent?: string;
}

export function DrumStepper({ paramId, label, accent }: DrumStepperProps) {
  const { t } = useTranslation();
  const def = DRUM_PARAMS[paramId];
  const value = useDrumStore((s) => s.params[paramId]);
  const setParam = useDrumStore((s) => s.setParam);

  if (def.curve === 'int' && !def.options) {
    const lo = def.min as number;
    const hi = def.max as number;
    const v = Math.min(hi, Math.max(lo, Math.round(value)));
    const stepN = (d: number) => setParam(paramId, Math.min(hi, Math.max(lo, v + d)));
    return (
      <div className="stepper" data-accent={accent}>
        {label ? <span className="st-label">{label}</span> : null}
        <button className="st-btn st-prev" aria-label={t('i18n-next48.stepper.previous')} onClick={() => stepN(-1)}>◂</button>
        <span className="st-value">{def.fmt ? def.fmt(v) : String(v)}</span>
        <button className="st-btn st-next" aria-label={t('i18n-next48.stepper.next')} onClick={() => stepN(1)}>▸</button>
      </div>
    );
  }

  const options = def.options as string[];
  const index = Math.min(options.length - 1, Math.max(0, value | 0));
  const step = (d: number) => {
    const n = options.length;
    setParam(paramId, (index + d + n) % n);
  };

  return (
    <div className="stepper" data-accent={accent}>
      {label ? <span className="st-label">{label}</span> : null}
      <button className="st-btn st-prev" aria-label={t('i18n-next48.stepper.previous')} onClick={() => step(-1)}>◂</button>
      <span className="st-value">{options[index]}</span>
      <button className="st-btn st-next" aria-label={t('i18n-next48.stepper.next')} onClick={() => step(1)}>▸</button>
    </div>
  );
}
