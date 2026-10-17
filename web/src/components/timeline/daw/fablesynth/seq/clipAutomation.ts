// Clip automation lanes (docs/superpowers/specs/2026-09-30-sq4-clip-automation-design.md).
// A lane draws one continuous device parameter over its own cycle. Points are
// normalized (0..1 in the parameter's curve) on a lane-local step axis; the
// store compiles them into absolute-value tables the worklets play back.

import { BASS_PARAMS } from '../bass/params';
import { DRUM_PARAMS } from '../drum/params';
import type { DrumRhythm } from '../drum/rhythm';
import { normToValue, PARAMS, valueToNorm, type ParamDef } from '../params';
import type { ClipDoc, MachineId } from './protocol';

export const AUTO_MAX_LANES = 8;
export const AUTO_MAX_STEPS = 64;
export const AUTO_MAX_POINTS = 512;
/** Table samples per lane step sent to the worklet. */
export const AUTO_RES = 16;
/** Finest point spacing in steps (FREE snap). */
export const AUTO_TICK = 0.25;
export const AUTO_COLORS = ['#4de8ff', '#ffa14d', '#b18cff', '#7ef0a6', '#ff72b0', '#ffdd6b', '#6f9dff', '#ff8466'];

export type AutoTime =
  | { mode: 'clip' }
  | { mode: 'grid'; steps: number }
  | { mode: 'fit'; steps: number; cycleBeats: 4 | 8 }
  | { mode: 'pad' };

export interface AutoPoint {
  t: number; // lane step, multiple of AUTO_TICK
  v: number; // 0..1, normalized in the target's curve
  c?: number; // -1..1 bend of the segment leaving this point
  hold?: boolean; // keep v until the next point
}

export interface AutoLane {
  target: string;
  enabled: boolean;
  time: AutoTime;
  points: AutoPoint[];
}

/** One compiled lane as the worklets consume it. */
export interface AutoConfig {
  k: string;
  table: Float32Array; // len * AUTO_RES absolute values
  len: number; // cycle length in steps (grid) or slots (fit)
  fit: number; // FIT cycle in beats, 0 = sixteenth grid
  rot: number; // POLY rotation, in steps/slots
}

const DEFS: Record<MachineId, Record<string, ParamDef>> = { WT1: PARAMS, BL1: BASS_PARAMS, DR1: DRUM_PARAMS };
const EXCLUDED = new Set(['seq.bpm', 'master.swing']);

export function autoParamDef(machine: MachineId, id: string): ParamDef | null {
  const def = DEFS[machine][id];
  if (!def || def.type || EXCLUDED.has(id)) return null;
  return def.curve === 'lin' || def.curve === 'log' ? def : null;
}

const PREFIX: Record<string, string> = {
  oscA: 'OSC A', oscB: 'OSC B', osc: 'OSC', filter: 'F1', filter2: 'F2', flt: 'FILTER',
  env1: 'AMP ENV', env2: 'MOD ENV', lfo1: 'LFO 1', lfo2: 'LFO 2', sub: 'SUB', noise: 'NOISE',
  master: 'MASTER', modenv: 'MOD ENV', pitch: 'PITCH', amp: 'AMP', fx: 'FX',
};

/** Short display name: `F1 CUTOFF`, `P04 FX EQ HI`, `LVL`. */
export function autoTargetLabel(machine: MachineId, id: string): string {
  const def = DEFS[machine][id];
  const parts = id.split('.');
  const pad = /^pad(\d+)$/.exec(parts[0]);
  const head = pad ? `P${String(+pad[1] + 1).padStart(2, '0')}` : null;
  const body = pad ? parts.slice(1) : parts;
  const last = def?.label || body[body.length - 1];
  const groups = body.slice(0, -1).map(p => PREFIX[p] ?? p.toUpperCase());
  return [head, ...groups, last.toUpperCase()].filter(Boolean).join(' ');
}

/**
 * Automatable parameters for the target picker, grouped by section. DR-1
 * lists the given pad's parameters plus the group bus.
 */
export function autoTargets(machine: MachineId, pad = 0): { group: string; ids: string[] }[] {
  const ids = Object.keys(DEFS[machine]).filter(id => autoParamDef(machine, id)
    && (machine !== 'DR1' || !id.startsWith('pad') || id.startsWith(`pad${pad}.`)));
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const parts = id.split('.');
    const pads = /^pad(\d+)$/.test(parts[0]);
    const body = pads ? parts.slice(1) : parts;
    const group = `${pads ? `PAD ${String(pad + 1).padStart(2, '0')} ` : ''}${body.length > 1 ? PREFIX[body[0]] ?? body[0].toUpperCase() : 'MAIN'}`;
    groups.set(group, [...(groups.get(group) ?? []), id]);
  }
  return [...groups].map(([group, list]) => ({ group, ids: list }));
}

export function autoPadOf(target: string): number | null {
  const m = /^pad(\d+)\./.exec(target);
  return m ? +m[1] : null;
}

export function newAutoLane(target: string): AutoLane {
  return { target, enabled: true, time: { mode: 'clip' }, points: [] };
}

export interface LaneCycle { len: number; fit: number; rot: number; follows: boolean }

/** The lane's playing cycle, resolving CLIP and PAD against the clip. */
export function laneCycle(lane: AutoLane, bars: number, rhythm?: DrumRhythm | null): LaneCycle {
  const clip = { len: Math.max(1, bars) * 16, fit: 0, rot: 0, follows: false };
  const time = lane.time;
  if (time.mode === 'grid') return { len: time.steps, fit: 0, rot: 0, follows: false };
  if (time.mode === 'fit') return { len: time.steps, fit: time.cycleBeats, rot: 0, follows: false };
  if (time.mode === 'pad') {
    const pad = autoPadOf(lane.target);
    const poly = pad === null ? null : rhythm?.lanes[pad];
    if (!poly?.enabled) return clip;
    return { len: poly.steps, fit: poly.timing.mode === 'fit' ? poly.timing.cycleBeats : 0, rot: poly.rotation, follows: true };
  }
  return clip;
}

/** Lane-local position (steps/slots) for a transport position in sixteenths. */
export function lanePhase(cycle: LaneCycle, elapsedSteps: number): number {
  const raw = cycle.fit
    ? (mod(elapsedSteps / 4, cycle.fit) / cycle.fit) * cycle.len
    : elapsedSteps;
  return mod(raw - cycle.rot, cycle.len);
}

const mod = (x: number, n: number) => ((x % n) + n) % n;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Exponential bend: c=0 is linear, c>0 starts slow, c<0 starts fast. */
export function bend(f: number, c = 0): number {
  if (Math.abs(c) < 1e-3) return f;
  const k = c * 6;
  return (Math.exp(k * f) - 1) / (Math.exp(k) - 1);
}

/** Last index whose t <= x (points sorted), or -1. */
function segmentAt(points: AutoPoint[], x: number): number {
  let lo = 0, hi = points.length - 1, at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= x) { at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return at;
}

/** Normalized value at lane position x; the last point wraps to the first. */
export function evalLane(points: AutoPoint[], len: number, x: number): number | null {
  const pts = points.filter(p => p.t < len);
  if (!pts.length) return null;
  x = mod(x, len);
  let i = segmentAt(pts, x);
  let t0: number;
  if (i < 0) { i = pts.length - 1; t0 = pts[i].t - len; } else t0 = pts[i].t;
  const a = pts[i];
  if (a.hold) return a.v;
  const wraps = i === pts.length - 1;
  const b = wraps ? pts[0] : pts[i + 1];
  const t1 = wraps ? b.t + len : b.t;
  if (t1 - t0 <= 1e-9) return b.v;
  return a.v + (b.v - a.v) * bend((x - t0) / (t1 - t0), a.c);
}

function quant(t: number) { return Math.round(t / AUTO_TICK) * AUTO_TICK; }

/** Sort, bound, and drop points that can never be heard. */
export function tidyPoints(points: AutoPoint[]): AutoPoint[] {
  const sorted = points
    .map(p => ({ ...p, t: quant(Math.max(0, p.t)), v: clamp01(p.v) }))
    .map((p, i) => ({ p, i }))
    .sort((x, y) => x.p.t - y.p.t || x.i - y.i)
    .map(x => x.p);
  const out: AutoPoint[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const same = sorted.filter(q => q.t === p.t);
    // A time holds at most an arrival and a departure point.
    if (same.length > 2 && p !== same[0] && p !== same[same.length - 1]) continue;
    const prev = out[out.length - 1];
    if (prev && prev.t === p.t) {
      // The arrival is inaudible after a hold, and redundant when equal.
      const before = out[out.length - 2];
      if (prev.v === p.v || (before?.hold && before.t < p.t)) { out[out.length - 1] = p; continue; }
    }
    out.push(p);
  }
  for (const p of out) {
    if (!p.c) delete p.c;
    if (!p.hold) delete p.hold;
  }
  return out.slice(0, AUTO_MAX_POINTS);
}

/** Replace [t0, t1) with the given points, pinning the old curve at both edges. */
function splice(points: AutoPoint[], len: number, t0: number, t1: number, insert: AutoPoint[]): AutoPoint[] {
  const before = evalLane(points, len, t0);
  const after = evalLane(points, len, t1);
  const kept = points.filter(p => p.t < t0 || p.t >= t1);
  const edge: AutoPoint[] = [];
  if (before !== null && points.length) edge.push({ t: t0, v: before });
  if (after !== null && t1 < len && !kept.some(p => p.t === t1)) edge.push({ t: t1, v: after });
  // Arrival first, then the new shape, then the resume point.
  return tidyPoints([...kept.filter(p => p.t < t0), ...edge.filter(p => p.t === t0), ...insert,
    ...edge.filter(p => p.t === t1), ...kept.filter(p => p.t >= t1)]);
}

/** DRAW: one held value per cell of width `grid`, starting at the cell holding t. */
export function paintCell(points: AutoPoint[], len: number, t: number, v: number, grid: number): AutoPoint[] {
  const t0 = Math.floor(Math.max(0, Math.min(len - AUTO_TICK, t)) / grid) * grid;
  const t1 = Math.min(len, t0 + grid);
  return splice(points, len, t0, t1, [{ t: t0, v: clamp01(v), hold: true }]);
}

/** LINE: a straight ramp from (ta, va) to (tb, vb). */
export function drawLine(points: AutoPoint[], len: number, ta: number, va: number, tb: number, vb: number): AutoPoint[] {
  if (tb < ta) [ta, va, tb, vb] = [tb, vb, ta, va];
  const last = len - AUTO_TICK;
  ta = quant(Math.min(last, Math.max(0, ta))); tb = quant(Math.min(last, Math.max(0, tb)));
  if (tb - ta < AUTO_TICK) return paintCell(points, len, ta, va, AUTO_TICK);
  return splice(points, len, ta, tb, [{ t: ta, v: clamp01(va) }, { t: tb, v: clamp01(vb) }]);
}

export function addPoint(points: AutoPoint[], t: number, v: number): { points: AutoPoint[]; index: number } {
  const p = { t: quant(t), v: clamp01(v) };
  const next = tidyPoints([...points.filter(q => q.t !== p.t), p]);
  return { points: next, index: next.findIndex(q => q.t === p.t) };
}

/** Move point i, keeping it between its neighbours. */
export function movePoint(points: AutoPoint[], len: number, i: number, t: number, v: number): AutoPoint[] {
  const lo = i > 0 ? points[i - 1].t : 0;
  const hi = i < points.length - 1 ? points[i + 1].t : len - AUTO_TICK;
  return points.map((p, j) => j === i ? { ...p, t: Math.min(hi, Math.max(lo, quant(t))), v: clamp01(v) } : p);
}

export function bendSegment(points: AutoPoint[], i: number, c: number): AutoPoint[] {
  return points.map((p, j) => j === i ? { ...p, c: Math.max(-1, Math.min(1, c)), hold: undefined } : p);
}

export function removePoint(points: AutoPoint[], i: number): AutoPoint[] {
  return tidyPoints(points.filter((_, j) => j !== i));
}

// ---------- document validation / copy ----------

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const intIn = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

export function validateAutomation(value: unknown, machine: MachineId): string | null {
  if (!Array.isArray(value)) return 'automation must be an array';
  if (value.length > AUTO_MAX_LANES) return 'too many automation lanes';
  for (let i = 0; i < value.length; i++) {
    const lane = value[i];
    if (!record(lane)) return `automation lane ${i}: must be an object`;
    if (typeof lane.target !== 'string' || !autoParamDef(machine, lane.target)) return `automation lane ${i}: unknown target`;
    if (typeof lane.enabled !== 'boolean') return `automation lane ${i}: enabled must be boolean`;
    const time = lane.time;
    if (!record(time)) return `automation lane ${i}: invalid time`;
    if (time.mode === 'grid' || time.mode === 'fit') {
      if (!intIn(time.steps, 1, AUTO_MAX_STEPS)) return `automation lane ${i}: steps out of range`;
      if (time.mode === 'fit' && time.cycleBeats !== 4 && time.cycleBeats !== 8) return `automation lane ${i}: invalid cycle`;
    } else if (time.mode === 'pad') {
      if (machine !== 'DR1' || autoPadOf(lane.target) === null) return `automation lane ${i}: PAD time needs a pad target`;
    } else if (time.mode !== 'clip') return `automation lane ${i}: invalid time mode`;
    if (!Array.isArray(lane.points) || lane.points.length > AUTO_MAX_POINTS) return `automation lane ${i}: invalid points`;
    let last = -1;
    for (const p of lane.points) {
      if (!record(p) || typeof p.t !== 'number' || typeof p.v !== 'number' || !(p.t >= 0 && p.t < 256) || !(p.v >= 0 && p.v <= 1)
        || p.t < last || (p.c !== undefined && !(typeof p.c === 'number' && p.c >= -1 && p.c <= 1))
        || (p.hold !== undefined && typeof p.hold !== 'boolean')) return `automation lane ${i}: invalid point`;
      last = p.t;
    }
  }
  return null;
}

export function copyAutomation(lanes: AutoLane[]): AutoLane[] {
  return lanes.map(l => ({ target: l.target, enabled: l.enabled, time: { ...l.time }, points: l.points.map(p => ({ ...p })) }));
}

/** Absolute-value tables for every audible lane of the clip. */
export function compileClipAutomation(clip: ClipDoc, machine: MachineId): AutoConfig[] {
  return compileAutomation(clip.automation ?? [], clip.bars, clip.drumRhythm, machine);
}

/** Absolute-value tables for every audible lane of a sequence of `bars` bars. */
export function compileAutomation(lanes: AutoLane[], bars: number, rhythm: DrumRhythm | null | undefined, machine: MachineId): AutoConfig[] {
  const out: AutoConfig[] = [];
  const seen = new Set<string>();
  for (const lane of lanes) {
    const def = autoParamDef(machine, lane.target);
    // Lanes are listed top-down; the first lane on a parameter wins.
    if (!lane.enabled || !def || seen.has(lane.target)) continue;
    const cycle = laneCycle(lane, bars, rhythm);
    if (!lane.points.some(p => p.t < cycle.len)) continue;
    seen.add(lane.target);
    const table = new Float32Array(cycle.len * AUTO_RES);
    for (let i = 0; i < table.length; i++) table[i] = normToValue(def, evalLane(lane.points, cycle.len, i / AUTO_RES)!);
    out.push({ k: lane.target, table, len: cycle.len, fit: cycle.fit, rot: cycle.rot });
  }
  return out;
}

/** Stored knob value as a normalized baseline for an empty lane. */
export function autoBaseline(machine: MachineId, id: string, value: number | undefined): number {
  const def = autoParamDef(machine, id);
  if (!def || value === undefined) return 0.5;
  return clamp01(valueToNorm(def, value));
}

export function autoFormat(machine: MachineId, id: string, v: number): string {
  const def = autoParamDef(machine, id);
  if (!def) return '';
  const value = normToValue(def, v);
  return def.fmt ? def.fmt(value) : value.toFixed(2);
}
