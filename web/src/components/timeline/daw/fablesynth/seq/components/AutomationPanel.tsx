import { registerAutomationFocus } from '../automationFocus';
// Automation editor (docs/superpowers/specs/2026-09-30-sq4-clip-automation-design.md).
// Lane chips with miniature curves, a compact inspector for the selected
// lane, and one large drawing surface. The time axis always shows the clip;
// a POLY lane's own cycle is solid and its repeats are ghosted. The lanes come
// from an AutoSource: an SQ-4 clip or the standalone DR-1 sequence.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useBassStore } from '../../bass/store';
import type { DrumRhythm } from '../../drum/rhythm';
import { useDrumStore } from '../../drum/store';
import { useStore as useWtStore } from '../../store';
import {
  addPoint, AUTO_COLORS, AUTO_MAX_LANES, AUTO_MAX_STEPS, AUTO_TICK, autoBaseline, autoFormat, autoPadOf, autoParamDef,
  autoTargetLabel, autoTargets, bendSegment, drawLine, evalLane, lanePhase, laneCycle, movePoint, newAutoLane,
  paintCell, removePoint, type AutoLane, type AutoPoint, type AutoTime, type LaneCycle,
} from '../clipAutomation';
import type { MachineId } from '../protocol';
import { useSeqStore } from '../store';
import { publishAutoLive } from '../autoLive';
import '../automation.css';

type Tool = 'draw' | 'line' | 'point';
const EDITOR_H = 132;
const PAD_Y = 6;

const PARAM_STORES = {
  WT1: { use: () => useWtStore(s => s.params), get: () => useWtStore.getState().params, subscribe: useWtStore.subscribe },
  BL1: { use: () => useBassStore(s => s.params), get: () => useBassStore.getState().params, subscribe: useBassStore.subscribe },
  DR1: { use: () => useDrumStore(s => s.params), get: () => useDrumStore.getState().params, subscribe: useDrumStore.subscribe },
} as const;

const DEFAULT_TARGET: Record<MachineId, (pad: number) => string> = {
  WT1: () => 'filter.cutoff',
  BL1: () => 'flt.cut',
  DR1: pad => `pad${pad}.flt.cut`,
};

const mod = (x: number, n: number) => ((x % n) + n) % n;

/** Clip-step geometry of a lane: unit = clip steps per lane step or FIT slot. */
function geometry(cycle: LaneCycle, clipSteps: number) {
  const unit = cycle.fit ? (cycle.fit * 4) / cycle.len : 1;
  const span = cycle.len * unit;
  return {
    ...cycle, unit, span, axis: Math.max(clipSteps, span), clipSteps,
    toClip: (t: number) => mod(t + cycle.rot, cycle.len) * unit,
    toLane: (s: number) => mod(mod(s, span) / unit - cycle.rot, cycle.len),
  };
}
type Geo = ReturnType<typeof geometry>;

function curvePath(points: AutoPoint[], geo: Geo, w: number, h: number, from: number, to: number, samples: number) {
  let d = '';
  for (let i = 0; i <= samples; i++) {
    const s = from + ((to - from) * i) / samples;
    const v = evalLane(points, geo.len, geo.toLane(Math.min(s, to - 1e-6)));
    if (v === null) return '';
    d += `${i ? 'L' : 'M'}${((s / geo.axis) * w).toFixed(1)},${(PAD_Y + (1 - v) * (h - 2 * PAD_Y)).toFixed(1)}`;
  }
  return d;
}

function timeReadout(lane: AutoLane, cycle: LaneCycle, bars: number, unit: string): string {
  const clip = `${bars} BAR${bars > 1 ? 'S' : ''}`;
  switch (lane.time.mode) {
    case 'clip': return `FOLLOWS ${unit} · ${clip}`;
    case 'grid': return `LOOP ${cycle.len} × 1/16 · AGAINST ${clip}`;
    case 'fit': return `${cycle.len} IN ${cycle.fit === 4 ? '1 BAR' : '2 BARS'} · STRAIGHT`;
    case 'pad': return cycle.follows
      ? `PAD POLY · ${cycle.fit ? `${cycle.len} IN ${cycle.fit / 4} BAR` : `LOOP ${cycle.len}`}${cycle.rot ? ` · ROT ${cycle.rot}` : ''}`
      : `PAD IS NOT POLY · FOLLOWS ${unit}`;
  }
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const set = (v: number) => { const next = Math.max(min, Math.min(max, v)); if (next !== value) onChange(next); };
  return <div className="sq-auto-stepper" role="group" aria-label={label}>
    <span className="sq-auto-label">{label}</span>
    <button type="button" aria-label={`Decrease ${label}`} onClick={() => set(value - 1)}>‹</button>
    <input aria-label={label} inputMode="numeric" value={value}
      onChange={e => { const n = Number(e.target.value); if (Number.isInteger(n)) set(n); }}
      onWheel={e => { (e.target as HTMLInputElement).blur(); }} />
    <button type="button" aria-label={`Increase ${label}`} onClick={() => set(value + 1)}>›</button>
  </div>;
}

function Seg<T extends string | number>({ label, value, options, onChange }: {
  label?: string; value: T; options: { value: T; label: string; title?: string }[]; onChange: (v: T) => void;
}) {
  return <div className="sq-auto-seg-wrap">
    {label && <span className="sq-auto-label">{label}</span>}
    <div className="sq-auto-seg" role="radiogroup" aria-label={label}>
      {options.map(o => <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value}
        className={o.value === value ? 'on' : ''} title={o.title} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  </div>;
}

function Spark({ lane, cycle }: { lane: AutoLane; cycle: LaneCycle }) {
  const d = useMemo(() => {
    let out = '';
    for (let i = 0; i <= 40; i++) {
      const v = evalLane(lane.points, cycle.len, (i / 40) * cycle.len * 0.9999);
      if (v === null) return '';
      out += `${i ? 'L' : 'M'}${i},${(12 - v * 10).toFixed(1)}`;
    }
    return out;
  }, [lane.points, cycle.len]);
  return <svg className="sq-auto-spark" viewBox="0 0 40 14" aria-hidden="true">
    {d ? <path d={d} /> : <line x1="0" x2="40" y1="7" y2="7" className="empty" />}
  </svg>;
}

type WriteOpts = { history?: boolean; persist?: boolean };

/** Where the lanes live and how the panel follows their transport. */
export interface AutoSource {
  /** Changes when the panel edits a different clip or sequence. */
  id: string;
  /** What the lanes belong to, as the UI names it. */
  unit: 'CLIP' | 'SEQUENCE';
  lanes: AutoLane[];
  bars: number;
  rhythm?: DrumRhythm | null;
  current: () => AutoLane[];
  write: (lanes: AutoLane[], opts?: WriteOpts) => void;
  /** Transport steps since the anchor, or null while the source does not play. */
  elapsed: () => number | null;
}

/** SQ-4: the focused clip. */
export function AutomationPanel({ machine }: { machine: MachineId }) {
  const focus = useSeqStore(s => s.focus);
  const clip = useSeqStore(s => (focus ? s.session.scenes[focus.scene]?.clips[focus.track] : undefined));
  if (!focus || !clip) return null;
  const { scene, track } = focus;
  const at = () => useSeqStore.getState().session.scenes[scene]?.clips[track];
  const source: AutoSource = {
    id: `${scene}:${track}`,
    unit: 'CLIP',
    lanes: clip.automation ?? [],
    bars: clip.bars,
    rhythm: clip.drumRhythm,
    current: () => at()?.automation ?? [],
    write: (next, opts) => useSeqStore.getState().updateClipAutomation(scene, track, next, opts),
    elapsed: () => {
      const st = useSeqStore.getState();
      if (!st.playing || st.owner[track] !== scene || !st.rig) return null;
      const stepFrames = (st.rig.sampleRate * 60) / st.session.bpm / 4;
      return Math.max(0, (st.rig.now() - st.anchor) / stepFrames);
    },
  };
  return <AutomationEditor machine={machine} source={source} />;
}

// `onReveal` lets a tabbed device body switch to its automation page when a
// control menu asks to show a lane.
export function AutomationEditor({ machine, source, onReveal }: { machine: MachineId; source: AutoSource; onReveal?: () => void }) {
  const lanes = source.lanes;
  const params = PARAM_STORES[machine].use();
  const drumPad = useDrumStore(s => s.sel);
  const [open, setOpen] = useState(lanes.length > 0);
  const [selected, setSelected] = useState(0);
  const [tool, setTool] = useState<Tool>('draw');
  const [snap, setSnap] = useState(true);
  const [learn, setLearn] = useState(false);
  const sel = Math.min(selected, Math.max(0, lanes.length - 1));
  const lane = lanes[sel] as AutoLane | undefined;
  const lastFit = useFitMemory(lane);
  // Publish what each lane plays now so the device knobs can show it. A
  // stopped source marks the automated knobs at their stored value.
  const liveRef = useRef({ source, machine });
  liveRef.current = { source, machine };
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const { source: src, machine: m } = liveRef.current;
      const elapsed = src.elapsed();
      const stored = PARAM_STORES[m].get();
      const entries: { id: string; norm: number; color: string }[] = [];
      src.lanes.forEach((l, i) => {
        if (!l.enabled || !autoParamDef(m, l.target)) return;
        const base = autoBaseline(m, l.target, stored[l.target]);
        let norm = base;
        if (elapsed !== null) {
          const cycle = laneCycle(l, src.bars, src.rhythm);
          norm = evalLane(l.points, cycle.len, lanePhase(cycle, elapsed)) ?? base;
          if (!l.points.length) return;
        } else if (!l.points.length) return;
        entries.push({ id: l.target, norm, color: AUTO_COLORS[i % AUTO_COLORS.length] });
      });
      publishAutoLive(m, entries);
    };
    tick();
    return () => { cancelAnimationFrame(raf); publishAutoLive(liveRef.current.machine, []); };
  }, [machine]);
  // The panel sits below the sequencer in a scrolling body. An explicit open
  // brings the editor into view; a clip change with lanes opens in place.
  const rootRef = useRef<HTMLElement>(null);
  const reveal = useRef(false);
  const expand = () => { reveal.current = true; setOpen(true); };
  useEffect(() => {
    if (!open || !reveal.current) return;
    reveal.current = false;
    rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open]);

  // A different clip starts on its first lane, closed when it has none.
  useEffect(() => { setSelected(0); setLearn(false); setOpen(source.current().length > 0); }, [source.id]);

  const write = source.write;
  const current = source.current;
  const patchLane = (i: number, patch: Partial<AutoLane>, opts?: WriteOpts) =>
    write(current().map((l, j) => (j === i ? { ...l, ...patch } : l)), opts);

  const addLane = () => {
    if (lanes.length >= AUTO_MAX_LANES) return;
    const used = new Set(lanes.map(l => l.target));
    const preferred = DEFAULT_TARGET[machine](drumPad);
    const target = !used.has(preferred) && autoParamDef(machine, preferred) ? preferred
      : autoTargets(machine, drumPad).flatMap(g => g.ids).find(id => !used.has(id));
    if (!target) return;
    write([...lanes, newAutoLane(target)]);
    setSelected(lanes.length);
    expand();
  };

  useEffect(() => registerAutomationFocus(machine, {
    canShow: target => Boolean(autoParamDef(machine, target)) &&
      (source.current().some(l => l.target === target) || source.current().length < AUTO_MAX_LANES),
    show: target => {
      if (!autoParamDef(machine, target)) return;
      const now = source.current();
      let index = now.findIndex(l => l.target === target);
      if (index < 0) {
        if (now.length >= AUTO_MAX_LANES) return;
        index = now.length;
        source.write([...now, newAutoLane(target)]);
      }
      setSelected(index);
      setLearn(false);
      setOpen(true);
      onReveal?.();
      requestAnimationFrame(() => rootRef.current?.scrollIntoView({ block: 'nearest' }));
    },
    has: target => source.current().some(l => l.target === target),
    remove: target => {
      const now = source.current();
      const index = now.findIndex(l => l.target === target);
      if (index < 0) return;
      source.write(now.filter((_, j) => j !== index));
      setSelected(sel => Math.max(0, sel > index ? sel - 1 : Math.min(sel, now.length - 2)));
      setLearn(false);
    },
  }), [machine, source, onReveal]);

  // LEARN: the next continuous knob moved on this device becomes the target.
  useEffect(() => {
    if (!learn || !lane) return;
    const store = PARAM_STORES[machine];
    let prev = store.get();
    return store.subscribe(() => {
      const next = store.get();
      if (next === prev) return;
      const moved = Object.keys(next).find(k => next[k] !== prev[k] && autoParamDef(machine, k));
      prev = next;
      if (!moved) return;
      setLearn(false);
      const lanesNow = current();
      if (lanesNow.some((l, j) => j !== sel && l.target === moved)) return;
      const keepPad = lanesNow[sel]?.time.mode === 'pad' && autoPadOf(moved) === null;
      patchLane(sel, { target: moved, ...(keepPad ? { time: { mode: 'clip' } } : {}) });
    });
  }, [learn, sel, machine, !!lane]);

  const bars = source.bars;
  const cycles = lanes.map(l => laneCycle(l, bars, source.rhythm));

  if (!open) {
    return <section ref={rootRef} className="sq-auto collapsed" aria-label="Clip automation">
      <header className="sq-auto-head">
        <button type="button" className="sq-auto-disclose" aria-expanded={false} onClick={() => lanes.length ? expand() : addLane()}>
          <span className="sq-auto-caret" aria-hidden="true">▸</span><span className="sq-auto-title">AUTOMATION</span>
        </button>
        {lanes.length > 0
          ? <div className="sq-auto-chips">{lanes.map((l, i) => <button key={i} type="button" className="sq-auto-chip" style={{ '--lc': AUTO_COLORS[i] } as React.CSSProperties}
              onClick={() => { setSelected(i); expand(); }}><span className="sq-auto-dot" />{autoTargetLabel(machine, l.target)}<Spark lane={l} cycle={cycles[i]} /></button>)}</div>
          : <span className="sq-auto-hint">DRAW PARAMETER MOVES INTO THIS {source.unit}</span>}
        <button type="button" className="sq-auto-add" onClick={addLane}>＋ LANE</button>
      </header>
    </section>;
  }

  const color = AUTO_COLORS[sel % AUTO_COLORS.length];
  const cycle = lane ? cycles[sel] : null;
  const padTarget = lane ? autoPadOf(lane.target) : null;
  const timeMode = lane?.time.mode ?? 'clip';
  const setTime = (mode: AutoTime['mode']) => {
    if (!lane || !cycle) return;
    const steps = Math.min(AUTO_MAX_STEPS, lane.time.mode === 'grid' || lane.time.mode === 'fit' ? lane.time.steps : cycle.len);
    const time: AutoTime = mode === 'grid' ? { mode, steps } : mode === 'fit' ? { mode, steps: Math.min(steps, 16), cycleBeats: lastFit } : { mode };
    patchLane(sel, { time });
  };

  return <section ref={rootRef} className="sq-auto" aria-label="Clip automation" style={{ '--lc': color } as React.CSSProperties}
    onKeyDown={e => e.stopPropagation()}>
    <header className="sq-auto-head">
      <button type="button" className="sq-auto-disclose" aria-expanded onClick={() => setOpen(false)}>
        <span className="sq-auto-caret" aria-hidden="true">▾</span><span className="sq-auto-title">AUTOMATION</span>
      </button>
      <div className="sq-auto-chips" role="tablist" aria-label="Automation lanes">
        {lanes.map((l, i) => <button key={i} type="button" role="tab" aria-selected={i === sel}
          className={`sq-auto-chip${i === sel ? ' on' : ''}${l.enabled ? '' : ' off'}`}
          style={{ '--lc': AUTO_COLORS[i % AUTO_COLORS.length] } as React.CSSProperties}
          onClick={() => { setSelected(i); setLearn(false); }}>
          <span className="sq-auto-dot" />{autoTargetLabel(machine, l.target)}<Spark lane={l} cycle={cycles[i]} />
        </button>)}
        {lanes.length < AUTO_MAX_LANES && <button type="button" className="sq-auto-add" onClick={addLane}>＋ LANE</button>}
      </div>
      <Seg value={tool} onChange={setTool} options={[
        { value: 'draw', label: '✎ DRAW', title: 'Paint one held value per cell' },
        { value: 'line', label: '╱ LINE', title: 'Drag a straight ramp' },
        { value: 'point', label: '◆ POINT', title: 'Click to add · drag to move · Alt-drag a segment to bend · double-click to remove' },
      ]} />
      <Seg label="SNAP" value={snap ? 'grid' : 'free'} onChange={v => setSnap(v === 'grid')} options={[
        { value: 'grid', label: '1/16' }, { value: 'free', label: 'FREE' },
      ]} />
    </header>

    {lane && cycle ? <>
      <div className="sq-auto-inspector">
        <label className="sq-auto-target">
          <span className="sq-auto-label">TARGET</span>
          <select value={lane.target} onChange={e => {
            const target = e.target.value;
            patchLane(sel, { target, ...(lane.time.mode === 'pad' && autoPadOf(target) === null ? { time: { mode: 'clip' } } : {}) });
          }}>
            {!autoTargets(machine, drumPad).some(g => g.ids.includes(lane.target)) &&
              <option value={lane.target}>{autoTargetLabel(machine, lane.target)}</option>}
            {autoTargets(machine, drumPad).map(g => <optgroup key={g.group} label={g.group}>
              {g.ids.map(id => <option key={id} value={id} disabled={id !== lane.target && lanes.some(l => l.target === id)}>
                {autoTargetLabel(machine, id)}</option>)}
            </optgroup>)}
          </select>
        </label>
        <button type="button" className={`sq-auto-learn${learn ? ' on' : ''}`} aria-pressed={learn}
          title="Move a knob on the device to set the target" onClick={() => setLearn(!learn)}>
          {learn ? 'MOVE A KNOB…' : 'LEARN'}</button>
        <Seg label="TIME" value={timeMode} onChange={setTime} options={[
          { value: 'clip', label: source.unit === 'CLIP' ? 'CLIP' : 'SEQ', title: `Follow the ${source.unit.toLowerCase()} length` },
          { value: 'grid', label: 'GRID', title: 'Loop every N sixteenths' },
          { value: 'fit', label: 'FIT', title: 'N equal slots in 1 or 2 bars' },
          ...(machine === 'DR1' && padTarget !== null ? [{ value: 'pad' as const, label: 'PAD', title: 'Follow the pad POLY lane' }] : []),
        ]} />
        {(lane.time.mode === 'grid' || lane.time.mode === 'fit') &&
          <Stepper label="STEPS" value={lane.time.steps} min={1} max={AUTO_MAX_STEPS}
            onChange={steps => patchLane(sel, { time: { ...(lane.time as { mode: 'grid' }), steps } as AutoTime })} />}
        {lane.time.mode === 'fit' &&
          <Seg label="CYCLE" value={lane.time.cycleBeats} onChange={cycleBeats => patchLane(sel, { time: { ...(lane.time as { mode: 'fit'; steps: number }), mode: 'fit', cycleBeats } })}
            options={[{ value: 4 as const, label: '1 BAR' }, { value: 8 as const, label: '2 BARS' }]} />}
        <span className="sq-auto-readout">{timeReadout(lane, cycle, bars, source.unit)}</span>
        <span className="sq-auto-actions">
          <button type="button" className={`sq-auto-power${lane.enabled ? ' on' : ''}`} aria-pressed={lane.enabled}
            onClick={() => patchLane(sel, { enabled: !lane.enabled })}><span className="sq-auto-led" aria-hidden="true" />{lane.enabled ? 'ON' : 'OFF'}</button>
          <button type="button" onClick={() => patchLane(sel, { points: [] })} disabled={!lane.points.length}>CLEAR</button>
          <button type="button" aria-label="Delete lane" title="Delete lane"
            onClick={() => { write(lanes.filter((_, j) => j !== sel)); setSelected(Math.max(0, sel - 1)); setLearn(false); }}>✕</button>
        </span>
      </div>
      <LaneEditor key={`${source.id}:${sel}`} machine={machine} lane={lane} elapsed={source.elapsed}
        geo={geometry(cycle, bars * 16)} tool={tool} grid={snap ? 1 : AUTO_TICK}
        baseline={autoBaseline(machine, lane.target, params[lane.target])}
        latest={() => current()[sel]?.points ?? lane.points}
        patch={(points, opts) => patchLane(sel, { points }, opts)} />
    </> : <div className="sq-auto-empty">
      <button type="button" className="sq-auto-add big" onClick={addLane}>＋ ADD AN AUTOMATION LANE</button>
    </div>}
  </section>;
}

/** Remembers the last FIT cycle while a lane is in another time mode. */
function useFitMemory(lane: AutoLane | undefined): 4 | 8 {
  const memory = useRef<4 | 8>(4);
  if (lane?.time.mode === 'fit') memory.current = lane.time.cycleBeats;
  return memory.current;
}

type Drag =
  | { kind: 'draw'; last: { t: number; v: number } }
  | { kind: 'line'; from: { t: number; v: number }; to: { t: number; v: number }; base: AutoPoint[] }
  | { kind: 'move'; index: number; base: AutoPoint[] }
  | { kind: 'bend'; index: number; y0: number; c0: number; dir: number; base: AutoPoint[] };

function LaneEditor({ machine, lane, elapsed: transport, geo, tool, grid, baseline, latest, patch }: {
  machine: MachineId; lane: AutoLane; elapsed: () => number | null; geo: Geo; tool: Tool; grid: number; baseline: number;
  latest: () => AutoPoint[];
  patch: (points: AutoPoint[], opts?: { history?: boolean; persist?: boolean }) => void;
}) {
  const clipId = useId().replace(/:/g, '');
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState<{ x: number; t: number; v: number } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [linePreview, setLinePreview] = useState<{ a: { t: number; v: number }; b: { t: number; v: number } } | null>(null);
  const h = EDITOR_H;
  const innerH = h - 2 * PAD_Y;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(200, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const xOf = (s: number) => (s / geo.axis) * w;
  const yOf = (v: number) => PAD_Y + (1 - v) * innerH;
  const points = lane.points.filter(p => p.t < geo.len);

  const locate = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(w - 0.01, e.clientX - r.left));
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top - PAD_Y) / innerH));
    const s = (x / w) * geo.axis;
    return { x, s, t: geo.toLane(s), v };
  };
  const snapT = (t: number) => Math.min(geo.len - AUTO_TICK, Math.round(t / grid) * grid);
  const hitPoint = (s: number) => {
    const first = mod(s, geo.span);
    let best = -1, bestD = 9;
    lane.points.forEach((p, i) => {
      if (p.t >= geo.len) return;
      const d = Math.abs(xOf(geo.toClip(p.t)) - xOf(first));
      if (d < bestD) { best = i; bestD = d; }
    });
    return best;
  };

  const down = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    const at = locate(e);
    if (tool === 'draw') {
      patch(paintCell(lane.points, geo.len, at.t, at.v, grid), { persist: false });
      setDrag({ kind: 'draw', last: { t: at.t, v: at.v } });
    } else if (tool === 'line') {
      const a = { t: snapT(at.t), v: at.v };
      setDrag({ kind: 'line', from: a, to: a, base: lane.points });
      setLinePreview({ a, b: a });
    } else {
      const hit = hitPoint(at.s);
      if (e.altKey && lane.points.length > 1) {
        const pts = lane.points;
        let i = -1;
        for (let j = 0; j < pts.length; j++) if (pts[j].t <= at.t) i = j;
        if (i < 0) i = pts.length - 1;
        const next = pts[(i + 1) % pts.length];
        setDrag({ kind: 'bend', index: i, y0: e.clientY, c0: pts[i].c ?? 0, dir: Math.sign(next.v - pts[i].v) || 1, base: pts });
        patch(pts, { persist: false });
      } else if (hit >= 0) {
        setDrag({ kind: 'move', index: hit, base: lane.points });
        patch(lane.points, { persist: false });
      } else {
        const added = addPoint(lane.points, snapT(at.t), at.v);
        patch(added.points, { persist: false });
        setDrag({ kind: 'move', index: added.index, base: added.points });
      }
    }
  };

  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const at = locate(e);
    setHover({ x: at.x, t: at.t, v: at.v });
    if (!drag) return;
    const opts = { history: false, persist: false };
    if (drag.kind === 'draw') {
      // Fill every cell between the previous and the current pointer sample.
      let pts = latest();
      const { t: t0, v: v0 } = drag.last;
      const cells = Math.max(1, Math.ceil(Math.abs(at.t - t0) / grid));
      if (Math.abs(at.t - t0) < geo.len / 2) {
        for (let k = 1; k <= cells; k++) {
          const f = k / cells;
          pts = paintCell(pts, geo.len, t0 + (at.t - t0) * f, v0 + (at.v - v0) * f, grid);
        }
      } else pts = paintCell(pts, geo.len, at.t, at.v, grid);
      patch(pts, opts);
      setDrag({ kind: 'draw', last: { t: at.t, v: at.v } });
    } else if (drag.kind === 'line') {
      const b = { t: snapT(at.t) + (snapT(at.t) >= drag.from.t ? grid : 0), v: at.v };
      setDrag({ ...drag, to: b });
      setLinePreview({ a: drag.from, b });
    } else if (drag.kind === 'move') {
      const p = drag.base[drag.index];
      patch(movePoint(drag.base, geo.len, drag.index, e.shiftKey ? p.t : snapT(at.t), at.v), opts);
    } else {
      const dy = (drag.y0 - e.clientY) / 70;
      patch(bendSegment(drag.base, drag.index, drag.c0 - dy * drag.dir), opts);
    }
  };

  const up = () => {
    if (!drag) return;
    if (drag.kind === 'line') {
      const { from, to } = drag;
      patch(drawLine(drag.base, geo.len, from.t, from.v, Math.min(geo.len - AUTO_TICK, to.t), to.v));
      setLinePreview(null);
    } else {
      patch(latest(), { history: false });
    }
    setDrag(null);
  };

  const removeAt = (e: { clientX: number; clientY: number; preventDefault: () => void }) => {
    const hit = hitPoint(locate(e).s);
    if (hit < 0) return;
    e.preventDefault();
    patch(removePoint(lane.points, hit));
  };

  const samples = Math.max(64, Math.round(w / 2));
  const firstPath = useMemo(() => curvePath(lane.points, geo, w, h, 0, geo.span, Math.round(samples * geo.span / geo.axis)), [lane.points, geo.span, geo.axis, geo.len, geo.rot, w]);
  const ghostPath = useMemo(() => geo.axis > geo.span
    ? curvePath(lane.points, geo, w, h, geo.span, geo.axis, Math.round(samples * (geo.axis - geo.span) / geo.axis)) : '',
  [lane.points, geo.span, geo.axis, geo.len, geo.rot, w]);
  const area = (d: string, from: number, to: number) => d ? `${d}L${xOf(to).toFixed(1)},${h}L${xOf(from).toFixed(1)},${h}Z` : '';

  // Grid: sixteenth ticks, beats, bars; FIT lanes also mark their slots.
  const columns = [];
  for (let s = 1; s < geo.axis; s++) {
    const kind = s % 16 === 0 ? 'bar' : s % 4 === 0 ? 'beat' : 'step';
    columns.push(<line key={`c${s}`} className={`sq-auto-col ${kind}`} x1={xOf(s)} x2={xOf(s)} y1={0} y2={h} />);
  }
  const slots = [];
  if (geo.fit) for (let k = 0; k < geo.len; k++) slots.push(<rect key={`s${k}`} className={`sq-auto-slot${k % 2 ? ' odd' : ''}`} x={xOf(geo.toClip(k))} width={xOf(geo.unit)} y={0} height={h} />);

  // Playheads: dim clip position over the axis; the lane's own position in its cycle.
  const clipHead = useRef<SVGLineElement>(null);
  const laneHead = useRef<SVGGElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const elapsed = transport();
      const live = elapsed !== null;
      clipHead.current?.setAttribute('visibility', live ? 'visible' : 'hidden');
      laneHead.current?.setAttribute('visibility', live && lane.enabled ? 'visible' : 'hidden');
      if (!live) return;
      const cx = xOf(mod(elapsed, geo.clipSteps));
      clipHead.current?.setAttribute('x1', String(cx));
      clipHead.current?.setAttribute('x2', String(cx));
      const lx = lanePhase(geo, elapsed);
      const sx = xOf(geo.toClip(lx));
      const v = evalLane(lane.points, geo.len, lx);
      laneHead.current?.setAttribute('transform', `translate(${sx.toFixed(1)},0)`);
      laneHead.current?.querySelector('circle')?.setAttribute('cy', String(v === null ? -20 : yOf(v)));
    };
    tick();
    return () => cancelAnimationFrame(raf);
  });

  const onCurve = hover ? evalLane(lane.points, geo.len, hover.t) : null;
  const tipV = hover ? (drag || onCurve === null ? hover.v : onCurve) : 0;

  return <div className={`sq-auto-editor tool-${tool}${lane.enabled ? '' : ' disabled'}`} ref={wrap}>
    <svg width={w} height={h} role="img" aria-label={`${autoTargetLabel(machine, lane.target)} automation`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onPointerLeave={() => { if (!drag) setHover(null); }}
      onDoubleClick={e => tool === 'point' && removeAt(e)} onContextMenu={removeAt}>
      <defs>
        <linearGradient id={`${clipId}-fill`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--lc)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--lc)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <rect className="sq-auto-cycle" x={0} width={xOf(geo.span)} y={0} height={h} />
      {slots}
      {[0.25, 0.5, 0.75].map(v => <line key={v} className="sq-auto-row" x1={0} x2={w} y1={yOf(v)} y2={yOf(v)} />)}
      {columns}
      {geo.axis > geo.span && <line className="sq-auto-cycle-end" x1={xOf(geo.span)} x2={xOf(geo.span)} y1={0} y2={h} />}
      {geo.span > geo.clipSteps && <line className="sq-auto-clip-end" x1={xOf(geo.clipSteps)} x2={xOf(geo.clipSteps)} y1={0} y2={h} />}
      {!points.length && <line className="sq-auto-baseline" x1={0} x2={w} y1={yOf(baseline)} y2={yOf(baseline)} />}
      {ghostPath && <g className="sq-auto-ghost"><path d={area(ghostPath, geo.span, geo.axis)} fill={`url(#${clipId}-fill)`} /><path d={ghostPath} className="sq-auto-line" /></g>}
      {firstPath && <g><path d={area(firstPath, 0, geo.span)} fill={`url(#${clipId}-fill)`} /><path d={firstPath} className="sq-auto-line" /></g>}
      {linePreview && <line className="sq-auto-preview" x1={xOf(geo.toClip(linePreview.a.t))} y1={yOf(linePreview.a.v)}
        x2={xOf(Math.min(geo.span, geo.toClip(linePreview.a.t) + (linePreview.b.t - linePreview.a.t) * geo.unit))} y2={yOf(linePreview.b.v)} />}
      {tool === 'point' && points.map((p, i) => <circle key={i}
        className={`sq-auto-point${p.hold ? ' hold' : ''}${drag?.kind === 'move' && drag.index === i ? ' active' : ''}`}
        cx={xOf(geo.toClip(p.t))} cy={yOf(p.v)} r={4} />)}
      <line ref={clipHead} className="sq-auto-clip-head" x1={0} x2={0} y1={0} y2={h} visibility="hidden" />
      <g ref={laneHead} visibility="hidden"><line className="sq-auto-lane-head" x1={0} x2={0} y1={0} y2={h} /><circle className="sq-auto-lane-dot" cx={0} cy={-20} r={3.5} /></g>
      {hover && !drag && <line className="sq-auto-cross" x1={hover.x} x2={hover.x} y1={0} y2={h} />}
    </svg>
    {hover && <span className="sq-auto-tip" style={{ left: Math.min(w - 120, hover.x + 10) }}>
      <b>{autoFormat(machine, lane.target, tipV)}</b>
      <span>{geo.fit ? `SLOT ${Math.floor(hover.t) + 1}/${geo.len}` : `STEP ${Math.floor(hover.t) + 1}/${geo.len}`}</span>
    </span>}
    {!points.length && <span className="sq-auto-empty-hint">{tool === 'draw' ? 'DRAG TO PAINT VALUES' : tool === 'line' ? 'DRAG TO DRAW A RAMP' : 'CLICK TO PLACE POINTS · ALT-DRAG TO BEND'}</span>}
  </div>;
}
