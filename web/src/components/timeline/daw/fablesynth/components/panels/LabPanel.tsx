import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { Knob } from '../Knob';
import { PowerButton } from '../PowerButton';
import { Stepper } from '../Stepper';
import './lab.css';
import type { FxPanelAdapter } from './fxAdapter';

// LAB page: the five experimental stages in signal order (lab-worklet.js,
// a port of juce/source/dsp/LabFx.h). Each card animates a picture drawn
// from its parameters, like the native LabPanel; nothing reads audio, so the
// pictures never claim to be live meters.

type Kind = 'crush' | 'reso' | 'shift' | 'spray' | 'glitch';
type P = Record<string, number>;

const CARDS: { kind: Kind; title: string; tagline: string; accent: string; ink: string; stepper?: string; knobs: string[] }[] = [
  { kind: 'crush', title: 'CRUSH', tagline: 'BIT + RATE DECIMATOR, JITTERED CLOCK', accent: 'b', ink: '#ff6b5d', knobs: ['bits', 'rate', 'chaos', 'mix'] },
  { kind: 'reso', title: 'RESO', tagline: 'FOUR COMBS RING AT A CHORD', accent: 'f', ink: '#b18cff', stepper: 'chord', knobs: ['note', 'decay', 'mix'] },
  { kind: 'shift', title: 'SHIFT', tagline: 'FREQUENCY SHIFT, SPIRALLING 1/16 ECHOES', accent: 'a', ink: '#4de8ff', knobs: ['hz', 'fb', 'spread', 'mix'] },
  { kind: 'spray', title: 'SPRAY', tagline: 'PITCHED GRAIN CLOUD, SCATTERED + REVERSED', accent: 'n', ink: '#9dffb0', knobs: ['pitch', 'density', 'scatter', 'mix'] },
  { kind: 'glitch', title: 'GLITCH', tagline: 'TEMPO-SYNCED BEAT REPEAT WITH TAPE DRIFT', accent: 'b', ink: '#ffa14d', stepper: 'div', knobs: ['chance', 'drift', 'mix'] },
];

const CHORDS = [[0, 12, 24, 36], [0, 7, 12, 19], [0, 3, 7, 10], [0, 4, 7, 14], [0, 5, 7, 12], [0, 6, 12, 18]];
const GLITCH_BEATS = [1, 0.5, 0.25, 0.125, 0.0625];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (n: number) => NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);

// Deterministic hash noise in [0, 1), so frames are stable between repaints.
function hash(i: number, salt = 0): number {
  let x = (Math.imul(i, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d) >>> 0; x ^= x >>> 12; x = Math.imul(x, 0x297a2d39) >>> 0; x ^= x >>> 15;
  return (x >>> 8) / 16777216;
}

function caption(kind: Kind, v: (k: string) => number): string {
  switch (kind) {
    case 'crush': return `${v('bits').toFixed(1)} BIT`;
    case 'reso': return noteName(Math.round(v('note')));
    case 'shift': { const hz = Math.round(v('hz')); return `${hz > 0 ? '+' : ''}${hz} HZ`; }
    case 'spray': { const st = Math.round(v('pitch')); return `${st > 0 ? '+' : ''}${st} ST`; }
    case 'glitch': return `${Math.round(v('chance') * 100)}% CHANCE`;
  }
}

function draw(g: CanvasRenderingContext2D, kind: Kind, ink: string, v: (k: string) => number, phase: number, w: number, h: number) {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, Math.round(h * i / 4) + 0.5); g.lineTo(w, Math.round(h * i / 4) + 0.5); g.stroke(); }
  for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(Math.round(w * i / 8) + 0.5, 0); g.lineTo(Math.round(w * i / 8) + 0.5, h); g.stroke(); }
  g.font = '8px "IBM Plex Mono", monospace';

  if (kind === 'crush') {
    const mid = h / 2, amp = h * 0.38, steps = Math.pow(2, v('bits') - 1), chaos = v('chaos');
    const rateNorm = Math.log(v('rate') / 200) / Math.log(240);
    const holds = Math.max(4, Math.min(160, Math.round(4 + rateNorm * rateNorm * 156)));
    g.strokeStyle = ink; g.globalAlpha = 0.22; g.lineWidth = 1.5; g.beginPath();
    for (let x = 0; x <= w; x += 2) { const y = mid - amp * Math.sin(phase * 2 + x / w * Math.PI * 4); if (x) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke(); g.globalAlpha = 1; g.lineWidth = 2; g.beginPath();
    const frame = Math.floor(phase * 8);
    for (let i = 0, x = 0; x < w; i++) {
      const width = w / holds * (1 + chaos * 1.6 * hash(i, frame));
      let q = Math.round(Math.sin(phase * 2 + x / w * Math.PI * 4) * steps) / steps;
      if (chaos > 0 && hash(i, frame + 99) < chaos * 0.15) q += (hash(i, 7) < 0.5 ? -1 : 1) / steps;
      const y = mid - amp * Math.max(-1, Math.min(1, q));
      if (i) g.lineTo(x, y); else g.moveTo(0, y);
      g.lineTo(Math.min(w, x + width), y); x += width;
    }
    g.stroke();
  } else if (kind === 'reso') {
    const chord = CHORDS[Math.max(0, Math.min(5, Math.round(v('chord'))))], note = Math.round(v('note')), decay = v('decay');
    const xOf = (hz: number) => Math.log(hz / 30) / Math.log(12000 / 30) * w;
    chord.forEach((iv, i) => {
      const f0 = 440 * Math.pow(2, (note + iv - 69) / 12);
      g.fillStyle = ink;
      for (let k = 1; k <= 24 && f0 * k <= 12000; k++) {
        const shimmer = 0.75 + 0.25 * Math.sin(phase * (3 + i) + k);
        const height = h * 0.82 * Math.pow(0.82, k - 1) * shimmer, width = 1 + 5 * (1 - decay);
        g.globalAlpha = 0.18 + 0.6 * decay * Math.pow(0.9, k);
        g.fillRect(xOf(f0 * k) - width / 2, h - height, width, height);
      }
      g.globalAlpha = 1; g.fillText(noteName(note + iv), xOf(f0) + 3, 12 + 11 * i);
    });
  } else if (kind === 'shift') {
    const hz = v('hz'), fb = v('fb'), spread = v('spread'), mid = h / 2, travel = (phase * 0.6) % 1;
    let echoes = 1;
    for (let amp = fb; echoes < 16 && amp > 0.04; amp *= fb) echoes++;
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(0, mid); g.lineTo(w, mid); g.stroke();
    const trace = (step: number, color: string) => {
      g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 1.5;
      const pts: [number, number, number][] = [];
      for (let k = 0, amp = 1; k < echoes; k++, amp *= fb) {
        const x = 18 + (w - 36) * k / Math.max(1, echoes - 1), off = k * step;
        pts.push([x, mid - Math.sign(off || 1) * h * 0.44 * (1 - Math.exp(-Math.abs(off) / 600)), amp]);
      }
      g.globalAlpha = 0.6; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      pts.forEach(([x, y, amp], k) => {
        const lit = Math.abs(k / Math.max(1, echoes - 1) - travel) < 0.06, r = 3 + 7 * amp;
        g.globalAlpha = lit ? 1 : 0.3 + 0.6 * amp; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      });
      g.globalAlpha = 1;
    };
    trace(hz * (1 - 2 * spread), '#ffa14d'); trace(hz, ink);
    g.fillStyle = '#93a0b8'; g.fillText('L', 4, 10); g.fillStyle = '#ffa14d'; g.fillText('R', 16, 10);
    g.fillStyle = '#93a0b8'; g.textAlign = 'right'; g.fillText('TIME (1/16) >', w - 4, h - 4); g.textAlign = 'left';
  } else if (kind === 'spray') {
    const pitch = v('pitch'), density = v('density'), scatter = v('scatter'), mid = h / 2 - pitch / 24 * h * 0.4;
    g.strokeStyle = 'rgba(159,180,216,0.35)'; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    const count = Math.max(3, Math.min(80, Math.round(density * 2))), t = phase * 0.35;
    for (let i = 0; i < count; i++) {
      const life = (t + hash(i, 1)) % 1;
      const x = w * (1 - ((hash(i, 2) * scatter + life * 0.35 + (1 - scatter) * 0.6) % 1));
      const y = mid + (hash(i, 3) - 0.5) * h * (0.08 + 0.5 * scatter);
      const a = Math.sin(life * Math.PI), r = 2 + 6 * a;
      g.globalAlpha = 0.15 + 0.75 * a; g.strokeStyle = ink; g.fillStyle = ink; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
      if (hash(i, 4) < scatter * 0.35) { g.lineWidth = 1.4; g.stroke(); } else g.fill();
    }
    g.globalAlpha = 1;
  } else {
    const div = Math.max(0, Math.min(4, Math.round(v('div')))), chance = v('chance'), drift = v('drift');
    const periods = 4, pw = w / periods, epoch = Math.floor(phase * 0.5), repeats = Math.round(2 / GLITCH_BEATS[div]);
    for (let p = 0; p < periods; p++) {
      const x0 = pw * p;
      g.strokeStyle = 'rgba(255,255,255,0.07)'; g.beginPath(); g.moveTo(x0 + 0.5, 0); g.lineTo(x0 + 0.5, h); g.stroke();
      if (hash(p, epoch) >= chance) { g.fillStyle = 'rgba(159,180,216,0.18)'; g.fillRect(x0 + 2, h * 0.35, pw - 4, h * 0.3); continue; }
      const sw = pw / repeats;
      for (let k = 0; k < repeats; k++) {
        const rate = Math.max(0.25, Math.min(4, Math.pow(2, drift * 0.25 * k)));
        const bh = Math.max(6, Math.min(h - 8, h * 0.3 * rate));
        g.globalAlpha = 0.35 + 0.6 * Math.pow(0.93, k); g.fillStyle = ink;
        g.fillRect(x0 + sw * k + 1, h / 2 - bh / 2, Math.max(1, sw - 2), bh);
      }
      g.globalAlpha = 1;
    }
    g.strokeStyle = 'rgba(223,230,243,0.7)'; g.beginPath(); const play = ((phase * 0.5) % 1) * w; g.moveTo(play, 0); g.lineTo(play, h); g.stroke();
    g.fillStyle = '#93a0b8'; g.fillText('1/2 BAR WINDOWS', 4, 10);
  }
}

function LabCard({ card, adapter }: { card: (typeof CARDS)[number]; adapter?: FxPanelAdapter }) {
  const id = (k: string) => `${adapter?.prefix ?? ''}fx.${card.kind}.${k}`;
  const storeParams = useStore(s => s.params);
  const params = adapter?.params ?? storeParams;
  const latest = useRef(params); latest.current = params;
  const on = params[id('on')] > 0.5;
  const label = caption(card.kind, k => params[id(k)] ?? 0);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current; if (!el) return;
    const g = el.getContext('2d'); if (!g) return;
    let raf = 0, phase = 0, last = performance.now();
    const frame = (now: number) => {
      const p: P = latest.current;
      const active = p[id('on')] > 0.5;
      if (active) phase += (now - last) / 1000;
      last = now;
      const dpr = window.devicePixelRatio || 1, w = el.clientWidth, h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalAlpha = 1;
      draw(g, card.kind, card.ink, k => p[id(k)] ?? 0, phase, w, h);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [card.kind, adapter?.prefix]); // animation reads the latest parameters without restarting on every knob move

  return (
    <section className={`lab-card${on ? '' : ' lab-bypassed'}`} data-accent={card.accent} aria-label={card.title}>
      <div className="panel-head">{adapter?.renderPower ? adapter.renderPower(id('on')) : <PowerButton paramId={id('on')} />}<h2>{card.title}</h2><span className="lab-state">{on ? label : 'BYPASS'}</span></div>
      <p className="lab-tagline">{card.tagline}</p>
      <canvas ref={canvas} className="lab-view" role="img" aria-label={`${card.title} parameter picture, not a live meter`} />
      {card.stepper ? adapter?.renderStepper ? adapter.renderStepper(id(card.stepper)) : <Stepper paramId={id(card.stepper)} accent={card.accent} /> : null}
      <div className="lab-knobs">{card.knobs.map(k => <span key={k}>{adapter?.renderKnob ? adapter.renderKnob(id(k), k) : <Knob paramId={id(k)} size="sm" accent={card.accent} />}</span>)}</div>
    </section>
  );
}

export function LabPanel({ adapter }: { adapter?: FxPanelAdapter }) {
  return (
    <section className="panel panel-lab" style={{ gridArea: 'lab' }} aria-label="Lab effects">
      {CARDS.map(card => <LabCard key={card.kind} card={card} adapter={adapter} />)}
    </section>
  );
}
