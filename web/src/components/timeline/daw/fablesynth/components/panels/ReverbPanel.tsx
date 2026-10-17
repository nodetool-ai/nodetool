import { useEffect, useRef } from 'react';
import { engine as wtEngine, useStore } from '../../store';
import { idleReverb, type ReverbMessage } from '../../engine/reverb';
import { Knob } from '../Knob';
import { PowerButton } from '../PowerButton';
import { setupCanvas } from '../displays/canvas';
import './reverb.css';
import type { FxPanelAdapter } from './fxAdapter';
import { fxId } from './fxAdapter';

const db = (value: number) => value <= -89 ? '−∞' : value.toFixed(1);
const level = (value: number) => Math.max(0, Math.min(1, (value + 72) / 72));

export function ReverbPanel({ adapter }: { adapter?: FxPanelAdapter } = {}) {
  const wtParams = useStore(s => adapter ? null : s.params);
  const params = adapter?.params ?? wtParams!;
  const source = adapter?.context;
  const prefix = adapter?.prefix ?? '', id = (key: string) => fxId(prefix, `fx.reverb.${key}`);
  const on = params[id('on')] > 0.5, activeEngine = adapter?.engine ?? wtEngine;
  const knob = adapter?.renderKnob ?? ((paramId: string) => <Knob paramId={paramId} size="sm" accent="n" />);
  const power = adapter?.renderPower ?? ((paramId: string) => <PowerButton paramId={paramId} />);
  const canvas = useRef<HTMLCanvasElement>(null), readings = useRef<HTMLDivElement>(null);
  const correlation = useRef<HTMLDivElement>(null), enabled = useRef(on);
  const redraw = useRef<() => void>(() => {});
  enabled.current = on;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let data = idleReverb(), stamp = 0, frame = 0;
    const history: { time: number; value: ReverbMessage }[] = [];
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const draw = () => {
      frame = 0;
      const { ctx: c, w, h } = setupCanvas(el), style = getComputedStyle(el);
      const slate = style.getPropertyValue('--ac-n').trim() || '#9fb4d8';
      const ice = style.getPropertyValue('--text').trim() || '#dfe6f3';
      const half = (w - 32) / 2, center = w / 2;
      const now = stamp || performance.now();
      c.clearRect(0, 0, w, h); c.font = '8px "IBM Plex Mono", monospace';
      c.fillStyle = slate; c.textAlign = 'left'; c.fillText(source ? `${source} RETURN` : 'LIVE TAIL', 12, 14);
      c.textAlign = 'right'; c.fillText(motion.matches ? 'STEREO LEVEL' : '3 s HISTORY', w - 12, 14);
      // Perspective is an age axis, not a simulated room. Each cross-section
      // represents measured L/R wet RMS; nothing moves without new audio data.
      const project = (depth: number) => ({ scale: 1 - depth * 0.72, y: h - 23 - depth * 69 });
      c.strokeStyle = slate; c.lineWidth = 0.7; c.globalAlpha = 0.17;
      for (const x of [-1, -0.5, 0, 0.5, 1]) {
        const back = project(1), front = project(0);
        c.beginPath(); c.moveTo(center + x * half * back.scale, back.y);
        c.lineTo(center + x * half, front.y); c.stroke();
      }
      c.globalAlpha = 1;
      const slices = motion.matches ? 1 : 25;
      for (let i = slices - 1; i >= 0; i--) {
        const depth = i / 24, { scale, y } = project(depth), age = depth * 3000;
        let value = data;
        if (i) {
          const target = now - age;
          // History arrives at ~30 Hz. Never fill pre-audio history with the
          // current sample, which would invent a tail before any sound played.
          value = idleReverb();
          for (let j = history.length - 1; j >= 0; j--) {
            if (history[j].time <= target) { value = history[j].value; break; }
          }
        }
        const l = level(value.left), r = level(value.right);
        c.beginPath();
        for (let step = 0; step <= 48; step++) {
          const x = step / 24 - 1;
          const amplitude = x < 0 ? l : r;
          const shape = Math.sin(Math.PI * Math.abs(x)) ** 1.35;
          const px = center + x * half * scale, py = y - shape * amplitude * 51 * scale;
          if (step) c.lineTo(px, py); else c.moveTo(px, py);
        }
        c.strokeStyle = i ? slate : ice;
        c.lineWidth = i ? 0.8 : 1.4;
        c.globalAlpha = i ? 0.15 + (1 - depth) * 0.42 : 0.9;
        c.shadowColor = ice; c.shadowBlur = !i && (l || r) ? 5 : 0;
        c.stroke(); c.shadowBlur = 0;
        c.lineTo(center + half * scale, y); c.lineTo(center - half * scale, y); c.closePath();
        c.fillStyle = slate; c.globalAlpha = (l + r) * 0.025 * (1 - depth); c.fill();
      }
      c.globalAlpha = 1; c.fillStyle = slate;
      c.textAlign = 'left'; c.fillText('L', 16, h - 8);
      c.textAlign = 'center'; c.fillText('NOW', center, h - 8);
      c.textAlign = 'right'; c.fillText('R', w - 16, h - 8);
      const values = [`${db(data.left)} dB`, `${db(data.right)} dB`];
      readings.current?.querySelectorAll('output').forEach((output, i) => { output.textContent = values[i]; });
      const silent = data.left <= -89 && data.right <= -89;
      const corr = silent ? '—' : `${data.correlation >= 0 ? '+' : ''}${data.correlation.toFixed(2)}`;
      if (correlation.current) {
        correlation.current.style.setProperty('--position', `${(data.correlation + 1) * 50}%`);
        correlation.current.dataset.silent = String(silent);
        correlation.current.querySelector('output')!.textContent = corr;
        correlation.current.setAttribute('aria-label', `Stereo correlation ${silent ? 'unavailable in silence' : corr}`);
      }
      el.setAttribute('aria-label', `${source ? `${source} shared reverb, pad send ${enabled.current ? 'active' : 'off'}` : `Reverb ${enabled.current ? 'active' : 'bypassed'}`}. Left return ${values[0]}, right return ${values[1]}. Stereo correlation ${corr}.`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    redraw.current = schedule;
    const unsubscribe = activeEngine.subscribeReverb(message => {
      data = message; stamp = performance.now(); history.push({ time: stamp, value: message });
      while (history.length && stamp - history[0].time > 3200) history.shift();
      schedule();
    });
    const resize = new ResizeObserver(schedule); resize.observe(el);
    const stale = window.setInterval(() => {
      if (stamp && performance.now() - stamp > 350) {
        stamp = 0; data = idleReverb(); history.length = 0; schedule();
      }
    }, 200);
    motion.addEventListener('change', schedule); schedule();
    return () => {
      unsubscribe(); resize.disconnect(); clearInterval(stale); cancelAnimationFrame(frame);
      motion.removeEventListener('change', schedule); redraw.current = () => {};
    };
  }, [activeEngine, prefix, source]);
  useEffect(() => { redraw.current(); }, [on]);

  return <section className={`panel panel-reverb${on ? '' : ' reverb-bypassed'}`} style={{ gridArea: 'reverb' }} aria-label={`Visual stereo reverb${adapter?.context ? `, ${adapter.context}` : ''}`}>
    <div className="panel-head">{power(id('on'))}<h2>REVERB</h2><span className="reverb-state">{source ? (on ? 'PAD SEND' : 'SEND OFF') : (on ? 'STEREO' : 'BYPASS')}</span></div>
    <canvas className="reverb-field" ref={canvas} role="img" aria-label="Stereo reverb tail" />
    <div className="reverb-readouts" ref={readings}>
      <div><span>L RETURN</span><output>−∞ dB</output></div><div><span>R RETURN</span><output>−∞ dB</output></div>
    </div>
    <div className="reverb-controls">
      {knob(id('size'), 'size')}
      {knob(id('mix'), 'mix')}
      <div className="reverb-correlation" ref={correlation} role="img" aria-label="Stereo correlation unavailable in silence" data-silent="true" title="Wet L/R correlation: +1 is mono, 0 is decorrelated, −1 is opposite polarity">
        <span>CORRELATION</span><output>—</output>
        <div className="reverb-correlation-track"><i /></div>
        <div className="reverb-correlation-scale"><span>−1</span><span>0</span><span>+1</span></div>
      </div>
    </div>
    {source && <div className="reverb-source-note">SHARED BUS RETURN · CONTROLS APPLY TO THIS PAD</div>}
  </section>;
}
