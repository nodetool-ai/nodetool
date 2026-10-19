// Kit auto-mix for the DR-1 group: LEARN captures every sounding pad's
// post-FX signal, the fit moves the pad levels so the kit follows the chosen
// reference curve, and APPLY writes them. UNDO restores the levels from
// before APPLY.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BAND_HZ, EQ_REFERENCES, alignToReference, referenceById, referenceDb } from '../../engine/autoEq';
import { useLiveSpectrum } from '../../components/panels/useLiveSpectrum';
import { KitCapture, fitKitMix } from '../kitMix';
import { pad, PAD_COUNT } from '../params';
import { useDrumStore } from '../dr1Store';

const LEARN_SECONDS = 8, TIMEOUT_SECONDS = 30;

const W = 300, H = 96, L = 22, R = 294, T = 6, B = 82;
const X = (f: number) => L + Math.log(f / 25) / Math.log(20000 / 25) * (R - L);
const Y = (d: number) => T + (18 - Math.max(-30, Math.min(18, d))) / 48 * (B - T);
const line = (ys: number[]) => ys.map((d, i) => `${i ? 'L' : 'M'}${X(BAND_HZ[i]).toFixed(1)} ${Y(d).toFixed(1)}`).join('');

export function KitMixPanel() {
  const { t } = useTranslation();
  const device = useDrumStore(s => s.device);
  const analyser = useDrumStore(s => s.analyser);
  const params = useDrumStore(s => s.params);
  const setParams = useDrumStore(s => s.setParams);
  const padNames = useDrumStore(s => s.padNames);
  const [reference, setReference] = useState('drums');
  const [amount, setAmount] = useState(0.8);
  const [progress, setProgress] = useState<number | null>(null);
  const [learned, setLearned] = useState<{ bands: Float64Array[]; lvl: number[] } | null>(null);
  const [undo, setUndo] = useState<number[] | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);
  const ref = referenceById(reference);
  // The fit is relative to the levels heard while learning.
  const fit = useMemo(() => learned && fitKitMix(learned.bands, learned.lvl, ref, amount), [learned, ref, amount]);

  const learn = () => {
    if (stopRef.current) { stopRef.current(); return; }
    if (!device) return;
    const capture = new KitCapture(device.sampleRate, PAD_COUNT);
    const lvl = Array.from({ length: PAD_COUNT }, (_, i) => params[pad(i, 'lvl')]);
    const detach = device.subscribePadAudio(m => {
      capture.add(m.pad, m.data, m.frames);
      setProgress(Math.min(1, capture.seconds / LEARN_SECONDS));
      if (capture.seconds >= LEARN_SECONDS) stop();
    });
    const timeout = window.setTimeout(() => stop(), TIMEOUT_SECONDS * 1000);
    const stop = () => {
      detach(); window.clearTimeout(timeout);
      stopRef.current = null;
      setProgress(null);
      if (capture.seconds >= 2) setLearned({ bands: capture.meanBands(), lvl });
    };
    stopRef.current = stop;
    setProgress(0);
  };

  const apply = () => {
    if (!fit || !learned) return;
    if (!undo) setUndo(Array.from({ length: PAD_COUNT }, (_, i) => params[pad(i, 'lvl')]));
    setParams(Object.fromEntries(learned.lvl.map((v, i) => [pad(i, 'lvl'), fit.levels[i] ?? v])));
  };
  const revert = () => {
    if (!undo) return;
    setParams(Object.fromEntries(undo.map((v, i) => [pad(i, 'lvl'), v])));
    setUndo(null);
  };

  const status = progress !== null ? t('i18n-next20.kitMixPanel.listening', { percent: Math.round(progress * 100) })
    : fit ? t('i18n-next20.kitMixPanel.error', { before: fit.errorBefore.toFixed(1), after: fit.errorAfter.toFixed(1) })
    : learned ? t('i18n-next20.kitMixPanel.needsTwoPads') : t('i18n-next20.kitMixPanel.playThenLearn');
  const target = fit?.target ?? BAND_HZ.map(f => referenceDb(ref, f));
  // The kit as it plays now, aligned to the reference like the learned curves.
  const live = useLiveSpectrum(analyser, (levels) => {
    const { offset } = alignToReference(levels, ref);
    const pts = levels.map((l, i) => `${i ? 'L' : 'M'}${X(BAND_HZ[i]).toFixed(1)} ${Y(l - offset).toFixed(1)}`).join('');
    return `${pts}L${X(BAND_HZ[BAND_HZ.length - 1]).toFixed(1)} ${B}L${X(BAND_HZ[0]).toFixed(1)} ${B}Z`;
  });
  const rows = fit ? fit.heard.flatMap((h, i) => h ? [i] : []).sort((a, b) => fit.share[b] - fit.share[a]) : [];

  return <section className="panel dr-kitmix" aria-label={t("i18n-next20.kitMixPanel.label")}>
    <div className="panel-head"><h2>{t("i18n-next20.kitMixPanel.title")}</h2><span className="dr-kitmix-status">{status}</span></div>
    <div className="dr-kitmix-body">
      <div className="dr-kitmix-side">
        <select aria-label={t("i18n-next20.kitMixPanel.reference")} value={reference} title={ref.hint} onChange={e => setReference(e.target.value)}>
          {EQ_REFERENCES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <label className="dr-kitmix-amount" title={t("i18n-next20.kitMixPanel.amountTitle")}>
          <input type="range" min={0} max={1} step={0.05} value={amount} aria-label={t("i18n-next20.kitMixPanel.amount")} onChange={e => setAmount(+e.target.value)} />
          <output>{Math.round(amount * 100)}%</output>
        </label>
        <div className="dr-kitmix-actions">
          <button type="button" className={`dr-kitmix-learn${progress !== null ? ' on' : ''}`} style={{ '--p': progress ?? 0 } as React.CSSProperties}
            disabled={!device} onClick={learn}>{progress !== null ? t('i18n-next20.kitMixPanel.stop') : learned ? t('i18n-next20.kitMixPanel.relearn') : t('i18n-next20.kitMixPanel.learn')}</button>
          <button type="button" disabled={!fit || progress !== null} onClick={apply}>{t("i18n-next20.kitMixPanel.apply")}</button>
          <button type="button" disabled={!undo} onClick={revert}>{t("i18n-next20.kitMixPanel.undo")}</button>
        </div>
      </div>
      <svg className="dr-kitmix-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("i18n-next20.kitMixPanel.spectrumLabel")}>
        {[100, 1000, 10000].map(f => <g key={f} className="grid"><path d={`M${X(f)} ${T}V${B}`} /><text x={X(f)} y={H - 3} textAnchor="middle">{f >= 1000 ? `${f / 1000}k` : f}</text></g>)}
        <path ref={live} className="live" d="" aria-hidden="true" />
        <path className="target" d={`${line(target.map(d => d + 3))}${target.map((_, i) => `L${X(BAND_HZ[target.length - 1 - i]).toFixed(1)} ${Y(target[target.length - 1 - i] - 3).toFixed(1)}`).join('')}Z`} />
        {fit && <path className="before" d={line(fit.before)} />}
        {fit && <path className="after" d={line(fit.after)} />}
      </svg>
      <ul className="dr-kitmix-pads" aria-label={t("i18n-next20.kitMixPanel.padMovesLabel")}>
        {rows.map(i => <li key={i}>
          <span>{String(i + 1).padStart(2, '0')} {padNames[i] ?? ''}</span>
          <i style={{ width: `${Math.round(fit!.share[i] * 100)}%` }} title={t("i18n-next20.kitMixPanel.kitEnergy", { percent: Math.round(fit!.share[i] * 100) })} />
          <b className={fit!.moves[i] ? '' : 'hold'}>{fit!.moves[i] ? `${fit!.moves[i] > 0 ? '+' : ''}${fit!.moves[i].toFixed(1)}` : t('i18n-next20.kitMixPanel.hold')}</b>
        </li>)}
      </ul>
    </div>
  </section>;
}
