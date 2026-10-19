import { DRIVE_TYPES, driveToneDb, driveTransfer } from '../../engine/drive';
import { useTranslation } from 'react-i18next';
import type { FxPanelAdapter } from './fxAdapter';
import { fxId } from './fxAdapter';
import './drive.css';

export function DrivePanel({ adapter, compact = false }: { adapter: FxPanelAdapter; compact?: boolean }) {
  const { t } = useTranslation();
  const { params, setParam } = adapter;
  const id = (key: string) => fxId(adapter.prefix, `fx.drive.${key}`);
  const on = params[id('on')] > 0.5, amount = params[id('amt')] ?? 0.3;
  const tone = params[id('tone')] ?? 0, type = Math.max(0, Math.min(2, Math.round(params[id('type')] ?? 0)));
  const mix = params[id('mix')] ?? 1, sr = adapter.engine.ctx?.sampleRate ?? 48000;
  const knob = adapter.renderKnob, power = adapter.renderPower;
  const path = (count: number, point: (i: number) => [number, number]) => Array.from({ length: count }, (_, i) => {
    const [x, y] = point(i); return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const transfer = path(161, i => {
    const x = i / 80 - 1;
    const y = on ? Math.cos(mix * Math.PI / 2) * x + Math.sin(mix * Math.PI / 2) * driveTransfer(x, amount, type) : x;
    return [22 + i * 1.275, 53 - y * 31];
  });
  const response = path(81, i => [22 + i * 2.55, 116 - driveToneDb(100 * 100 ** (i / 80), on ? tone : 0, sr) * 1.68]);
  return <section className={`${compact ? 'fx-module' : 'panel'} panel-drive${on ? '' : ' drive-bypassed'}`} style={compact ? undefined : { gridArea: 'drive' }} aria-label={t('i18n-next45-fablesynth-effects.drive.ariaLabel')}>
    <div className="panel-head">{power(id('on'))}<h2>{t('i18n-next116.fableSynth.effects.drive')}</h2><span className="drive-caption">{on ? t('i18n-next45-fablesynth-effects.drive.saturation') : t('i18n-next45-fablesynth-effects.common.bypass')}</span></div>
    <svg className="drive-view" viewBox="0 0 240 140" role="img" aria-label={t('i18n-next45-fablesynth-effects.drive.chartAriaLabel', { type: DRIVE_TYPES[type], state: on ? t('i18n-next45-fablesynth-effects.common.active') : t('i18n-next45-fablesynth-effects.common.bypassed'), amount: Math.round(amount * 100), mix: Math.round(mix * 100), tone: tone === 0 ? t('i18n-next45-fablesynth-effects.common.neutral') : tone < 0 ? t('i18n-next45-fablesynth-effects.common.dark') : t('i18n-next45-fablesynth-effects.common.bright') })}>
      <g className="drive-grid"><path d="M22 22H226 M22 53H226 M22 84H226 M124 22V84 M22 116H226" /><path className="drive-unity" d="M22 84L226 22" /></g>
      <g className="drive-label"><text x="22" y="14">{t('i18n-next45-fablesynth-effects.drive.transferMix')}</text><text x="22" y="100">{t('i18n-next45-fablesynth-effects.drive.wetTone')}</text><text x="7" y="87">−1</text><text x="7" y="25">+1</text><text x="22" y="135">100 Hz</text><text x="119" y="135">1k</text><text x="211" y="135">10k</text></g>
      <path className="drive-transfer" d={transfer} /><path className="drive-tone" d={response} />
    </svg>
    <div className="drive-type" role="group" aria-label={t('i18n-next45-fablesynth-effects.drive.saturationType')}>
      {DRIVE_TYPES.map((name, i) => <button key={name} type="button" aria-pressed={type === i} onClick={() => setParam(id('type'), i)} title={[t('i18n-next45-fablesynth-effects.drive.smoothClipping'), t('i18n-next45-fablesynth-effects.drive.tapeSaturation'), t('i18n-next45-fablesynth-effects.drive.hardClipping')][i]}>{name}</button>)}
    </div>
    <div className="drive-controls">{['amt', 'tone', 'mix'].map(key => <span key={key}>{knob(id(key), key)}</span>)}</div>
  </section>;
}
