import { useRef, type CSSProperties } from 'react';
import { defaultDrumLane } from '../rhythm';
import { patIdx } from '../seq';
import { useDrumStore } from '../store';
import { SequenceNumberInput } from './SequenceNumberInput';

export function LaneCursor({ pad, step, pattern }: { pad: number; step: number; pattern: number }) {
  const current = useDrumStore(s => {
    const lane = s.drumRhythm?.lanes[pad];
    // A silent row stays still: only rows with notes in their loop show the playhead.
    const start = patIdx(pattern, pad, 0);
    const length = lane?.enabled ? lane.steps : 16;
    let hasNotes = false;
    for (let i = 0; i < length && !hasNotes; i++) hasNotes = s.patterns[start + i] > 0;
    return s.playing && hasNotes && (lane?.enabled
      ? lane.sourceBar === pattern && s.lanePositions[pad] === pattern * 16 + step
      : s.curStep === step && s.curPat === pattern);
  });
  return <span className={`step-cur${current ? ' cur' : ''}`} aria-hidden="true" />;
}

/** The lane's loop as a row of LEDs: its source hits, and its own playhead. */
function LoopMeter({ pad, bar, steps, enabled }: { pad: number; bar: number; steps: number; enabled: boolean }) {
  const cells = useDrumStore(s => Array.from({ length: steps }, (_, i) => s.patterns[patIdx(bar, pad, i)]).join(''));
  const playing = useDrumStore(s => enabled && s.playing ? s.lanePositions[pad] - bar * 16 : -1);
  return <div className="dr-poly-meter" aria-hidden="true" style={{ '--poly-steps': steps } as CSSProperties}>
    {Array.from(cells, (value, i) => <span key={i}
      className={`dr-poly-led${value !== '0' ? ' hit' : ''}${value === '2' ? ' accent' : ''}${i === playing ? ' now' : ''}`} />)}
  </div>;
}

export function PolyLanePanel() {
  const sel = useDrumStore(s => s.sel);
  const stored = useDrumStore(s => s.drumRhythm?.lanes[sel]);
  const lane = stored ?? defaultDrumLane(0);
  const name = useDrumStore(s => s.padNames[sel]);
  const cycles = useRef<Record<number, 4 | 8>>({});
  if (lane.timing.mode === 'fit') cycles.current[sel] = lane.timing.cycleBeats;
  const { setLaneEnabled, updateLaneRhythm, undo, redo } = useDrumStore.getState();
  const fit = lane.timing.mode === 'fit';
  const readout = !lane.enabled ? 'OFF · SET STEPS TO START'
    : lane.timing.mode === 'fit' ? `${lane.steps} IN ${lane.timing.cycleBeats === 4 ? '1 BAR' : '2 BARS'} · STRAIGHT`
    : `LOOP ${lane.steps} × 1/16 · SWING`;
  return <div className={`dr-poly${lane.enabled ? ' on' : ''}`} id="dr-poly-panel" data-sequence-controls onKeyDown={e => e.stopPropagation()}>
    <div className="dr-poly-head">
      <span className="dr-poly-title">POLY</span>
      <span className="dr-poly-pad">{String(sel + 1).padStart(2, '0')} {name}</span>
      <button type="button" className="dr-poly-power" aria-label="Enable lane POLY" aria-pressed={lane.enabled}
        onClick={() => setLaneEnabled(sel, !lane.enabled)}><span className="dr-poly-power-led" aria-hidden="true" />{lane.enabled ? 'ON' : 'OFF'}</button>
      <LoopMeter pad={sel} bar={lane.sourceBar} steps={lane.steps} enabled={lane.enabled} />
      <span className="dr-poly-readout">{readout}</span>
      <span className="dr-poly-history">
        <button type="button" onClick={undo} aria-label="Undo sequence edit" title="Undo (⌘Z)">↶</button>
        <button type="button" onClick={redo} aria-label="Redo sequence edit" title="Redo (⇧⌘Z)">↷</button>
      </span>
    </div>
    <div className="dr-poly-controls">
      <fieldset className="dr-poly-group"><legend>MODE</legend>
        <div className="dr-poly-seg">{(['grid', 'fit'] as const).map(mode => <label key={mode}>
          <input type="radio" name="dr-poly-mode" value={mode} checked={lane.timing.mode === mode}
            onChange={() => updateLaneRhythm(sel, { timing: mode === 'grid' ? { mode } : { mode, cycleBeats: cycles.current[sel] ?? 4 } })} />
          <span>{mode.toUpperCase()}</span></label>)}</div>
      </fieldset>
      <SequenceNumberInput key={`steps-${sel}`} label="STEPS" min={1} max={16} value={lane.steps} onChange={steps => updateLaneRhythm(sel, { steps })} />
      {fit && <fieldset className="dr-poly-group"><legend>CYCLE</legend>
        <div className="dr-poly-seg">{([4, 8] as const).map(cycleBeats => <label key={cycleBeats}>
          <input type="radio" name="dr-poly-cycle" value={cycleBeats} checked={lane.timing.mode === 'fit' && lane.timing.cycleBeats === cycleBeats}
            onChange={() => updateLaneRhythm(sel, { timing: { mode: 'fit', cycleBeats } })} />
          <span>{cycleBeats / 4} {cycleBeats === 4 ? 'BAR' : 'BARS'}</span></label>)}</div>
      </fieldset>}
      <SequenceNumberInput key={`rotation-${sel}`} label="ROTATE" min={0} max={lane.steps - 1} wrap value={lane.rotation} onChange={rotation => updateLaneRhythm(sel, { rotation })} />
    </div>
  </div>;
}
