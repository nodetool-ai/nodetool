// Auto-EQ controls for the four-band EQ panel. LEARN listens to the device
// output, the fit compares it with the chosen reference, and APPLY writes the
// four bands. UNDO restores the EQ as it was before APPLY.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EQ_REFERENCES, SpectrumCapture, fitEq, referenceById, removeEq, type EqFit } from '../../engine/autoEq';
import { EQ_BANDS, readEqBands } from '../../engine/eqResponse';

const LEARN_SECONDS = 8, TIMEOUT_SECONDS = 30;
const EQ_KEYS = ['fx.eq.on', ...EQ_BANDS.flatMap(b => [b.freq, b.gain, b.q, b.type, b.on])];

export interface AutoEqSource {
  /** Node to listen to, or null when this EQ has no isolated signal. */
  source: AudioNode | null;
  /** True when the tap sits before this EQ, so its colouring is not removed. */
  preEq?: boolean;
  /** Default reference id for this device. */
  reference?: string;
  /** Shown when `source` is null. */
  note?: string;
}

interface Props {
  analysis: AutoEqSource;
  params: Record<string, number>;
  setParam: (key: string, value: number) => void;
  sampleRate: number;
  /** Receives the current fit so the panel can draw the match curve. */
  onFit: (fit: EqFit | null) => void;
}

export function AutoEqStrip({ analysis, params, setParam, sampleRate, onFit }: Props) {
  const { t } = useTranslation();
  const [reference, setReference] = useState(analysis.reference ?? 'mix');
  const [amount, setAmount] = useState(0.8);
  const [progress, setProgress] = useState<number | null>(null);
  const [levels, setLevels] = useState<number[] | null>(null);
  const [undo, setUndo] = useState<Record<string, number> | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const ref = referenceById(reference);

  const fit = useMemo(() => levels && fitEq(levels, ref, amount, sampleRate), [levels, ref, amount, sampleRate]);
  useEffect(() => { onFit(fit); }, [fit, onFit]);
  useEffect(() => () => { stopRef.current?.(); onFit(null); }, [onFit]);

  const learn = () => {
    if (stopRef.current) { stopRef.current(); return; }
    const source = analysis.source;
    if (!source) return;
    const tap = source.context.createAnalyser();
    tap.fftSize = 16384; tap.smoothingTimeConstant = 0;
    source.connect(tap);
    const capture = new SpectrumCapture(source.context.sampleRate, tap.fftSize);
    const spec = new Float32Array(tap.frequencyBinCount), time = new Float32Array(tap.fftSize);
    // The measurement is coloured by the EQ that was active while it ran.
    const colour = !analysis.preEq && params['fx.eq.on'] > 0.5 ? readEqBands(params) : null;
    const started = performance.now();
    const timer = window.setInterval(() => {
      tap.getFloatFrequencyData(spec); tap.getFloatTimeDomainData(time);
      capture.add(spec, time);
      setProgress(Math.min(1, capture.seconds / LEARN_SECONDS));
      if (capture.seconds >= LEARN_SECONDS || performance.now() - started > TIMEOUT_SECONDS * 1000) stop();
    }, tap.fftSize / source.context.sampleRate * 1000);
    const stop = () => {
      window.clearInterval(timer);
      try { source.disconnect(tap); } catch { /* already gone */ }
      stopRef.current = null;
      setProgress(null);
      if (capture.seconds >= 2) {
        const measured = capture.levels();
        setLevels(colour ? removeEq(measured, colour, sampleRate) : measured);
      }
    };
    stopRef.current = stop;
    setProgress(0);
  };

  const apply = () => {
    if (!fit) return;
    if (!undo) setUndo(Object.fromEntries(EQ_KEYS.map(k => [k, params[k]])));
    fit.bands.forEach((b, i) => {
      const k = EQ_BANDS[i];
      setParam(k.type, b.type); setParam(k.freq, b.freq); setParam(k.q, b.q); setParam(k.gain, b.gain); setParam(k.on, 1);
    });
    setParam('fx.eq.on', 1);
  };
  const revert = () => {
    if (!undo) return;
    for (const [k, v] of Object.entries(undo)) if (v !== undefined) setParam(k, v);
    setUndo(null);
  };

  const status = !analysis.source ? analysis.note ?? t('i18n-next44-fablesynth-controls.autoEq.noSignalTap')
    : progress !== null ? t('i18n-next44-fablesynth-controls.autoEq.listening', { percent: Math.round(progress * 100) })
    : fit ? t('i18n-next44-fablesynth-controls.autoEq.moves', { change: fit.change.toFixed(1) }) : t('i18n-next44-fablesynth-controls.autoEq.playThenLearn');
  return <div className="eq-auto">
    <div className="eq-auto-row">
      <select aria-label={t('i18n-next44-fablesynth-controls.autoEq.reference')} value={reference} title={t(`i18n-next44-fablesynth-controls.autoEq.references.${reference}Hint`, { defaultValue: ref.hint })} onChange={e => setReference(e.target.value)}>
        {EQ_REFERENCES.map(r => <option key={r.id} value={r.id}>{t(`i18n-next44-fablesynth-controls.autoEq.references.${r.id}`, { defaultValue: r.label })}</option>)}
      </select>
      <label className="eq-auto-amount" title={t('i18n-next44-fablesynth-controls.autoEq.amountHelp')}>
        <input type="range" min={0} max={1} step={0.05} value={amount} aria-label={t('i18n-next44-fablesynth-controls.autoEq.amount')} onChange={e => setAmount(+e.target.value)} />
        <output>{Math.round(amount * 100)}%</output>
      </label>
    </div>
    <div className="eq-auto-row">
      <button type="button" className={`eq-auto-learn${progress !== null ? ' on' : ''}`} disabled={!analysis.source}
        style={{ '--p': progress ?? 0 } as React.CSSProperties} onClick={learn}>{progress !== null ? t('i18n-next44-fablesynth-controls.autoEq.stop') : levels ? t('i18n-next44-fablesynth-controls.autoEq.relearn') : t('i18n-next44-fablesynth-controls.autoEq.learn')}</button>
      <button type="button" disabled={!fit || progress !== null} onClick={apply}>{t('i18n-next44-fablesynth-controls.autoEq.apply')}</button>
      <button type="button" disabled={!undo} onClick={revert}>{t('i18n-next44-fablesynth-controls.autoEq.undo')}</button>
    </div>
    <p className="eq-auto-status">{status}</p>
  </div>;
}
