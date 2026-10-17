import { Knob } from '../Knob';
import { Keyboard } from '../Keyboard';
import { useStore } from '../../store';

export function KeyboardBar() {
  const octave = useStore((s) => s.octave);
  const setOctave = useStore((s) => s.setOctave);
  const playNote = useStore((s) => s.playNote);

  return (
    <footer className="kb-bar">
      <div className="kb-side">
        <div className="oct-ctl">
          <button className="fs-oct-down" aria-label="octave down" onClick={() => setOctave(Math.max(-3, octave - 1))}>−</button>
          <span className="fs-oct-label">{'C' + (4 + octave)}</span>
          <button className="fs-oct-up" aria-label="octave up" onClick={() => setOctave(Math.min(3, octave + 1))}>+</button>
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
  const on = useStore((s) => !!s.params['master.mono']);
  const setParam = useStore((s) => s.setParam);
  return (
    <button
      className={`fs-mono-toggle${on ? ' on' : ''}`}
      aria-label="mono mode"
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
  const mono = useStore((s) => !!s.params['master.mono']);
  const on = useStore((s) => !!s.params['master.legato']);
  const setParam = useStore((s) => s.setParam);
  return (
    <button
      className={`fs-legato-toggle${on ? ' on' : ''}`}
      aria-label="legato"
      aria-pressed={on}
      disabled={!mono}
      title="LEGATO: a mono note change keeps the envelopes running; off retriggers them"
      onClick={() => setParam('master.legato', on ? 0 : 1)}
    >
      LEGATO
    </button>
  );
}
