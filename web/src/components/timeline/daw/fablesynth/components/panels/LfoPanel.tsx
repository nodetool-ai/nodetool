import { Knob } from '../Knob';
import { Stepper } from '../Stepper';
import { LFOView } from '../displays/LFOView';
import { ModSourceChip } from '../ModSourceChip';
import { ACCENTS } from '../../constants';
import type * as React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LFO_DIV_F, SYNC_BPM, lfoSource } from '../../params';
import { useStore } from '../../store';

function Toggle({ id, label }: { id: string; label: string }) {
  const v = useStore((s) => s.params[id]);
  const setParam = useStore((s) => s.setParam);
  return (
    <button className={`lfo-tg${v ? ' on' : ''}`} aria-pressed={!!v} onClick={() => setParam(id, v ? 0 : 1)}>
      {label}
    </button>
  );
}

function LfoBlock({ id, src, accentKey, picker }: { id: string; src: number; accentKey: 'a' | 'b'; picker: React.ReactNode }) {
  const shape = useStore((s) => s.params[`${id}.shape`]);
  const rate = useStore((s) => s.params[`${id}.rate`]);
  const sync = useStore((s) => s.params[`${id}.sync`]);
  const syncrate = useStore((s) => s.params[`${id}.syncrate`]);
  // The display animates at the LFO's actual speed: the synced division when
  // SYNC is on, otherwise the free RATE in Hz.
  const dispRate = sync
    ? (SYNC_BPM / 60) * LFO_DIV_F[Math.min(LFO_DIV_F.length - 1, Math.max(0, syncrate | 0))]
    : rate;
  return (
    <div className="lfo-block" data-accent={accentKey}>
      <div className="panel-head">
        <ModSourceChip src={src} compact />
        <h2>LFO</h2>
        {picker}
        <div className="lfo-toggles">
          <Toggle id={`${id}.sync`} label="SYNC" />
          <Toggle id={`${id}.retrig`} label="TRIG" />
        </div>
        <span className="ph-stepper"><Stepper paramId={`${id}.shape`} /></span>
      </div>
      <LFOView className="lfo-curve" shape={shape} rate={dispRate} accent={ACCENTS[accentKey]} />
      <div className="knob-row lfo-knobs">
        {sync
          ? <span className="lfo-div"><Stepper paramId={`${id}.syncrate`} accent={accentKey} /></span>
          : <Knob paramId={`${id}.rate`} size="sm" accent={accentKey} />}
        <Knob paramId={`${id}.rise`} size="sm" accent={accentKey} />
        <Knob paramId={`${id}.phase`} size="sm" accent={accentKey} />
      </div>
    </div>
  );
}

// Four LFOs in two slots: each slot shows one of two LFOs (left 1|3, right
// 2|4), picked by the number buttons beside its title.
export function LfoPanel() {
  const { t } = useTranslation();
  const [choice, setChoice] = useState([0, 0]);
  return (
    <section className="panel panel-lfos" style={{ gridArea: 'lfos' }}>
      {[0, 1].map((slot) => {
        const n = slot + 1 + choice[slot]! * 2;
        const picker = (
          <span className="lfo-pick" role="tablist" aria-label={t('i18n-next45-fablesynth-effects.lfo.slot', { slot: slot + 1 })}>
            {[0, 1].map((c) => (
              <button key={c} type="button" role="tab" className="lfo-pick-btn" aria-selected={choice[slot] === c}
                title={t('i18n-next45-fablesynth-effects.lfo.show', { number: slot + 1 + c * 2 })}
                onClick={() => setChoice((cur) => cur.map((v, i) => (i === slot ? c : v)))}>{slot + 1 + c * 2}</button>
            ))}
          </span>
        );
        return <LfoBlock key={n} id={`lfo${n}`} src={lfoSource(n)} accentKey={slot ? 'b' : 'a'} picker={picker} />;
      })}
    </section>
  );
}
