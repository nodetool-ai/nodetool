import { useTranslation } from 'react-i18next';
import { pad } from '../params';
import { useDrumStore } from '../dr1Store';
import { DrumKnob } from './DrumKnob';
import { NoiseView } from './NoiseView';

export function NoiseSection() {
  const { t } = useTranslation();
  const sel = useDrumStore((s) => s.sel);
  const colorId = pad(sel, 'noise.color');
  const color = useDrumStore((s) => s.params[colorId]);

  return (
    <section className="panel dr-noise-section" data-accent="b">
      <div className="panel-head">
        <span className="dr-led dr-led-b" aria-hidden="true" />
        <h2>{t('i18n-next107.drum.noise.title')}</h2>
        <span className="st-value dr-noise-type">METAL</span>
      </div>
      <NoiseView color={color} />
      <div className="knob-row dr-noise-knobs">
        <DrumKnob paramId={colorId} size="sm" accent="b" />
        <DrumKnob paramId={pad(sel, 'noise.level')} size="sm" accent="b" />
        <DrumKnob paramId={pad(sel, 'ring.freq')} size="sm" accent="b" label="FREQ" />
        <DrumKnob paramId={pad(sel, 'ring.mix')} size="sm" accent="b" label="MIX" />
      </div>
    </section>
  );
}
