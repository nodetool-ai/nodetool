import { useTranslation } from 'react-i18next';
import { LimiterView } from '../displays/LimiterView';
import type { FxPanelAdapter } from './fxAdapter';
import { fxId } from './fxAdapter';
import './limiter.css';

export function LimiterPanel({ adapter }: { adapter: FxPanelAdapter }) {
  const { t } = useTranslation();
  const { params } = adapter;
  const id = (key: string) => fxId(adapter.prefix, `fx.limit.${key}`);
  const on = params[id('on')] > 0.5;
  const ceiling = params[id('ceil')] ?? -1;
  const knob = adapter.renderKnob, power = adapter.renderPower;

  return <section className={`panel panel-limiter${on ? '' : ' limiter-bypassed'}`} aria-label={t('i18n-next45-fablesynth-effects.limiter.ariaLabel')}>
    <div className="panel-head">
      {power(id('on'))}
      <h2>LIMIT</h2>
      <span className="limiter-state">{on ? t('i18n-next45-fablesynth-effects.limiter.caption', { ceiling: ceiling.toFixed(1) }) : t('i18n-next45-fablesynth-effects.common.bypass')}</span>
    </div>
    <LimiterView engine={adapter.engine} on={on} ceiling={ceiling} />
    <div className="limiter-controls">{['gain', 'ceil', 'rel'].map(key => <span key={key}>{knob(id(key), key)}</span>)}</div>
  </section>;
}
