import { useState } from 'react';
import { useBassStore } from '../store';

export function BassPowerOverlay() {
  const powerOn = useBassStore((s) => s.powerOn);
  const [gone, setGone] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [booting, setBooting] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setDisabled(true);
    setBooting(true);
    try {
      await powerOn();
    } catch (err) {
      setError(
        location.protocol === 'file:'
          ? 'AudioWorklet needs an http server. Run:  python3 -m http.server  in the project folder, then open localhost.'
          : 'Audio engine failed to start: ' + (err as Error).message,
      );
      setDisabled(false);
      setBooting(false);
      return;
    }
    setGone(true);
    setTimeout(() => setRemoved(true), 700);
  };

  return (
    <div id="power-overlay" className={gone ? 'gone' : ''} style={removed ? { display: 'none' } : undefined}>
      <div className="po-inner">
        <div className="po-brand">FABLE<em>SYNTH</em></div>
        <div className="po-model">BL-1 · ACID BASSLINE ENGINE</div>
        <button id="power-on" className={booting ? 'booting' : ''} aria-label="power on" disabled={disabled} onClick={onClick}>
          <svg viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="105 27" strokeDashoffset="-13" strokeLinecap="round" />
            <line x1="24" y1="6" x2="24" y2="22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
        <div className="po-hint">power on · headphones recommended</div>
        {error ? <div className="po-error">{error}</div> : null}
      </div>
    </div>
  );
}
