import { useEffect, useRef } from 'react';
import { engine as wtEngine, useStore } from '../../store';
import { ECHO_DIVISIONS, idleEcho, type EchoMessage } from '../../engine/echo';
import { PARAMS } from '../../params';
import { Knob } from '../Knob';
import { PowerButton } from '../PowerButton';
import { setupCanvas } from '../displays/canvas';
import './tapeEcho.css';
import type { FxPanelAdapter } from './fxAdapter';
import { fxId } from './fxAdapter';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const db = (v: number) => v <= -89 ? '−∞' : v.toFixed(1);

export function TapeEchoPanel({ adapter }: { adapter?: FxPanelAdapter } = {}) {
  const wtParams = useStore(s => adapter ? null : s.params), wtSetParam = useStore(s => s.setParam);
  const params = adapter?.params ?? wtParams!, setParam = adapter?.setParam ?? wtSetParam;
  const tape = !adapter;
  const activeEngine = adapter?.engine ?? wtEngine, prefix = adapter?.prefix ?? '';
  const id = (key: string) => fxId(prefix, `fx.delay.${key}`);
  const on = params[id('on')] > 0.5, sync = params[id('sync')] > 0.5;
  const knob = adapter?.renderKnob ?? ((paramId: string) => <Knob paramId={paramId} size="sm" accent="n" />);
  const power = adapter?.renderPower ?? ((paramId: string) => <PowerButton paramId={paramId} />);
  const canvas = useRef<HTMLCanvasElement>(null), readings = useRef<HTMLDivElement>(null);
  const redraw = useRef<() => void>(() => {});
  const fallbackTime = sync ? clamp(60 / params['seq.bpm'] * ECHO_DIVISIONS[params[id('div')] | 0], 0.02, 1.5) : params[id('time')];
  const settings = useRef({ on, time: fallbackTime, feedback: params[id('fb')] });
  settings.current = { on, time: fallbackTime, feedback: params[id('fb')] };

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let data = idleEcho(settings.current.time), stamp = 0, frame = 0;
    const history: EchoMessage[] = [];
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const draw = () => {
      frame = 0;
      const { ctx: c, w, h } = setupCanvas(el), style = getComputedStyle(el);
      const ink = style.getPropertyValue('--text').trim() || '#dfe6f3';
      const slate = style.getPropertyValue('--ac-n').trim() || '#9fb4d8';
      const left = 30, right = w - 14, width = right - left;
      const active = settings.current.on;
      const time = active && stamp && data.time > 0 ? data.time : settings.current.time;
      c.clearRect(0, 0, w, h); c.lineWidth = 1; c.font = '8px "IBM Plex Mono", monospace';
      const text = (s: string, x: number, y: number, align: CanvasTextAlign = 'left') => {
        c.fillStyle = slate; c.textAlign = align; c.fillText(s, x, y);
      };
      text('LIVE RETURN', left, 13); text(motion.matches ? 'LEVEL / DRIFT' : '~3 s HISTORY', right, 13, 'right');
      // Repeat-spacing ruler, not predicted audio: the ribbons below are
      // measured L/R wet-return RMS, already including MIX and WIDTH.
      for (let repeat = 1; repeat * time < 3 && repeat < 16; repeat++) {
        const x = right - repeat * time / 3 * width;
        c.strokeStyle = slate; c.globalAlpha = 0.08 + Math.pow(settings.current.feedback, repeat) * 0.14;
        c.beginPath(); c.moveTo(x, 23); c.lineTo(x, h - 29); c.stroke(); c.globalAlpha = 1;
        if (repeat < 5 && time > 0.15) text(`×${repeat}`, x, h - 30, 'center');
      }
      const samples = motion.matches ? [data] : history;
      const X = (i: number) => left + (90 - samples.length + i) / 89 * width;
      (['left', 'right'] as const).forEach((key, channel) => {
        const y = channel === 0 ? 43 : 84, color = channel === 0 ? ink : slate;
        text(channel === 0 ? 'L' : 'R', 12, y + 3);
        c.strokeStyle = slate; c.globalAlpha = 0.22; c.beginPath(); c.moveTo(left, y); c.lineTo(right, y); c.stroke(); c.globalAlpha = 1;
        const amp = (m: EchoMessage) => clamp((m[key] + 72) / 72, 0, 1) * 18;
        const grad = c.createLinearGradient(left, 0, right, 0);
        grad.addColorStop(0, 'transparent'); grad.addColorStop(1, color);
        if (samples.length > 1) {
          c.beginPath(); samples.forEach((m, i) => { const x = X(i), a = amp(m); if (i) c.lineTo(x, y - a); else c.moveTo(x, y - a); });
          for (let i = samples.length - 1; i >= 0; i--) c.lineTo(X(i), y + amp(samples[i]));
          c.closePath(); c.fillStyle = grad; c.globalAlpha = 0.18; c.fill(); c.globalAlpha = 1;
          c.beginPath(); samples.forEach((m, i) => { if (i) c.lineTo(X(i), y - amp(m)); else c.moveTo(X(i), y - amp(m)); });
          c.strokeStyle = grad; c.lineWidth = 1.3; c.stroke(); c.lineWidth = 1;
        }
        const a = amp(data);
        if (a > 0) {
          c.strokeStyle = color; c.shadowColor = color; c.shadowBlur = 6;
          c.beginPath(); c.moveTo(right, y - a); c.lineTo(right, y + a); c.stroke(); c.shadowBlur = 0;
        }
      });
      const y = h - 13;
      if (tape) {
      text('Δ', 12, y + 3);
      c.strokeStyle = slate; c.globalAlpha = 0.15; c.beginPath(); c.moveTo(left, y); c.lineTo(right, y); c.stroke(); c.globalAlpha = 1;
      (['driftL', 'driftR'] as const).forEach((key, index) => {
        c.strokeStyle = index ? slate : ink; c.globalAlpha = active ? 0.7 : 0.2;
        c.beginPath(); samples.forEach((m, i) => {
          const offset = active ? clamp(m[key] / 0.003, -1, 1) * 7 : 0;
          if (i) c.lineTo(X(i), y - offset); else c.moveTo(X(i), y - offset);
        }); c.stroke(); c.globalAlpha = 1;
      });
      } else text('PING-PONG RETURN', left, y + 3);
      const values = [`${Math.round(time * 1000)} ms`, `${db(data.left)} dB`, `${db(data.right)} dB`, `${(Math.max(Math.abs(data.driftL), Math.abs(data.driftR)) * 1000).toFixed(2)} ms`];
      readings.current?.querySelectorAll('output').forEach((o, i) => { o.textContent = values[i]; });
      el.setAttribute('aria-label', `${tape ? 'Tape echo' : 'Delay'} ${active ? 'active' : 'bypassed'}. Time ${values[0]}. Left return ${values[1]}, right return ${values[2]}.${tape ? ` Tape drift ${values[3]}.` : ''}`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    redraw.current = schedule;
    const unsubscribe = activeEngine.subscribeEcho(message => {
      data = message; stamp = performance.now(); history.push(message);
      if (history.length > 90) history.shift(); schedule();
    });
    const resize = new ResizeObserver(schedule); resize.observe(el);
    const stale = window.setInterval(() => {
      if (stamp && performance.now() - stamp > 350) { stamp = 0; data = idleEcho(settings.current.time); history.length = 0; schedule(); }
    }, 200);
    motion.addEventListener('change', schedule); schedule();
    return () => { unsubscribe(); resize.disconnect(); clearInterval(stale); cancelAnimationFrame(frame); motion.removeEventListener('change', schedule); redraw.current = () => {}; };
  }, [activeEngine, prefix, tape]);
  useEffect(() => { redraw.current(); }, [params]);

  const controls = adapter ? ['time', 'fb', 'mix'] : ['time', 'fb', 'mix', 'tone', 'sat', 'wow', 'flutter', 'width'];
  return <section className={`panel panel-echo${tape ? '' : ' panel-delay'}${on ? '' : ' echo-bypassed'}`} style={{ gridArea: 'echo' }} aria-label={`${adapter?.title ?? 'Stereo tape echo'} visualizer`}>
    <div className="panel-head">
      {power(id('on'))}<h2>{adapter?.title ?? 'TAPE ECHO'}</h2>
      {!adapter && <select aria-label="Echo routing" value={params[id('mode')]} onChange={e => setParam(id('mode'), Number(e.target.value))}>
        <option value={0}>PING PONG</option><option value={1}>STEREO</option>
      </select>}
      {!adapter && <button className="echo-sync" aria-pressed={sync} onClick={() => setParam(id('sync'), sync ? 0 : 1)}>SYNC</button>}
      {!adapter && sync && <select aria-label="Echo beat division" value={params[id('div')]} onChange={e => setParam(id('div'), Number(e.target.value))}>
        {PARAMS['fx.delay.div'].options!.map((label, i) => <option key={label} value={i}>{label}</option>)}
      </select>}
    </div>
    <canvas ref={canvas} className="echo-curve" role="img" aria-label="Stereo tape echo return and drift" />
    <div className="echo-readouts" ref={readings}>
      <div><span>TIME</span><output>{Math.round(fallbackTime * 1000)} ms</output></div>
      <div><span>L</span><output>−∞ dB</output></div><div><span>R</span><output>−∞ dB</output></div>
      {tape && <div title="Actual delay-head modulation from wow and flutter"><span>DRIFT</span><output>0.00 ms</output></div>}
    </div>
    <div className="echo-controls">
      {controls.map(key => <div key={key} className={key === 'time' && sync ? 'echo-time-synced' : ''} ref={el => { if (el) el.inert = key === 'time' && sync; }} title={key === 'time' && sync ? 'Time follows the selected beat division' : undefined}>
        {knob(id(key), key)}
      </div>)}
    </div>
  </section>;
}
