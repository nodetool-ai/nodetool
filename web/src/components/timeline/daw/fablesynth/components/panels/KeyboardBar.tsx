import { Knob } from '../Knob';
import { useTranslation } from 'react-i18next';
import { Keyboard } from '../Keyboard';
import { useStore } from '../../store';

export function KeyboardBar() {
  const { t } = useTranslation();
  const octave = useStore((s) => s.octave);
  const setOctave = useStore((s) => s.setOctave);
  const playNote = useStore((s) => s.playNote);

  return (
    <footer className="kb-bar">
      <div className="kb-side">
        <div className="oct-ctl">
          <button className="fs-oct-down" aria-label={t('i18n-next45-fablesynth-effects.keyboard.octaveDown')} onClick={() => setOctave(Math.max(-3, octave - 1))}>−</button>
          <span className="fs-oct-label">{'C' + (4 + octave)}</span>
          <button className="fs-oct-up" aria-label={t('i18n-next45-fablesynth-effects.keyboard.octaveUp')} onClick={() => setOctave(Math.min(3, octave + 1))}>+</button>
        </div>
        <div className="fs-glide-knob"><Knob paramId="master.glide" size="sm" accent="n" /></div>
        <MonoToggle />
        <LegatoToggle />
      </div>
      <Keyboard low={36} high={84} onNote={playNote} />
    </footer>
  );
}

function MonoToggle() {
  const { t } = useTranslation();
  const on = useStore((s) => !!s.params['master.mono']);
  const setParam = useStore((s) => s.setParam);
  return (
    <button
      className={`fs-mono-toggle${on ? ' on' : ''}`}
      aria-label={t('i18n-next45-fablesynth-effects.keyboard.monoMode')}
      aria-pressed={on}
      onClick={() => setParam('master.mono', on ? 0 : 1)}
    >
      MONO
    </button>
  );
}

// Mono note change: LEGATO keeps the envelopes running; off retriggers them
// (Serum MONO). Only meaningful in mono, so it dims when MONO is off.
function LegatoToggle() {
  const { t } = useTranslation();
  const mono = useStore((s) => !!s.params['master.mono']);
  const on = useStore((s) => !!s.params['master.legato']);
  const setParam = useStore((s) => s.setParam);
  return (
    <button
      className={`fs-legato-toggle${on ? ' on' : ''}`}
      aria-label={t('i18n-next45-fablesynth-effects.keyboard.legato')}
      aria-pressed={on}
      disabled={!mono}
      title={t('i18n-next45-fablesynth-effects.keyboard.legatoTitle')}
      onClick={() => setParam('master.legato', on ? 0 : 1)}
    >
      LEGATO
    </button>
  );
}
