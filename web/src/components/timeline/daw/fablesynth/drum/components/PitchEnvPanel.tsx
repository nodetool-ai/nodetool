import { useTranslation } from 'react-i18next';
import { pad } from '../params';
import { useDrumStore } from '../dr1Store';
import { DrumEnvView } from './DrumEnvView';
import { DrumKnob } from './DrumKnob';

export function PitchEnvPanel() {
  const { t } = useTranslation();
  const sel = useDrumStore((s) => s.sel);
  const amountId = pad(sel, 'penv.amt');
  const decayId = pad(sel, 'penv.dec');
  const amount = useDrumStore((s) => s.params[amountId]);
  const decay = useDrumStore((s) => s.params[decayId]);

  return (
    <section className="panel dr-edit-panel dr-pitch-env" data-accent="a">
      <div className="panel-head">
        <h2>{t('i18n-next107.drum.pitchEnv.title')}</h2>
      </div>
      <DrumEnvView
        className="dr-env-view"
        mode="pitch"
        amt={amount}
        dec={decay}
        accent="#4de8ff"
      />
      <div className="knob-row dr-env-knobs dr-pitch-knobs">
        <DrumKnob paramId={amountId} size="md" accent="a" />
        <DrumKnob paramId={decayId} size="md" accent="a" />
      </div>
    </section>
  );
}
