import { tiltedLevels, useLiveSpectrum } from './useLiveSpectrum';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { PARAMS, fmtDb, fmtHz } from '../../params';
import { EQ_BANDS, eqCoefficients, eqResponseDb, eqValue, readEqBands } from '../../engine/eqResponse';
import type { FxPanelAdapter } from './fxAdapter';
import { AutoEqStrip } from './AutoEqStrip';
import { BAND_HZ, type EqFit } from '../../engine/autoEq';
import './eq.css';

const W = 360, H = 126, LEFT = 26, RIGHT = 348, TOP = 12, BOTTOM = 106;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const X = (freq: number) => LEFT + Math.log(freq / 20) / Math.log(1000) * (RIGHT - LEFT);
const Y = (gain: number) => TOP + (15 - gain) / 30 * (BOTTOM - TOP);

export function EqPanel({ adapter }: { adapter: FxPanelAdapter }) {
  const prefix = adapter.prefix ?? '';
  const source = adapter.params;
  const params = useMemo(() => Object.fromEntries(
    Object.keys(PARAMS).filter(k => k.startsWith('fx.eq.')).map(k => [k, source[prefix + k] ?? PARAMS[k].def])
  ), [source, prefix]);
  const writeParam = adapter.setParam;
  const setParam = useCallback((key: string, value: number) => writeParam(prefix + key, value), [writeParam, prefix]);
  const current = useRef(params);
  current.current = params;
  const [selected, select] = useState(1);
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ index: number; x: number; y: number; freq: number; gain: number } | null>(null);
  const bands = readEqBands(params), keys = EQ_BANDS[selected], band = bands[selected];
  const on = params['fx.eq.on'] > 0.5;
  const sampleRate = adapter.engine.ctx?.sampleRate ?? 48000;
  const [autoOpen, setAutoOpen] = useState(false);
  const [fit, setFit] = useState<EqFit | null>(null);
  const analysis = adapter.analysis ?? { source: null, note: 'NO SIGNAL TAP' };
  // Live spectrum behind the curve (EQ-analyser tilt), from the device output
  // or whatever the host names; nothing where no isolated signal exists.
  const liveSource = adapter.liveSpectrum !== undefined ? adapter.liveSpectrum : analysis.source;
  const live = useLiveSpectrum(liveSource ?? null, (levels) => {
    const pts = tiltedLevels(levels).map((l, i) => `${i ? 'L' : 'M'}${X(BAND_HZ[i]).toFixed(1)} ${Y(l).toFixed(1)}`).join('');
    return `${pts}L${X(BAND_HZ[BAND_HZ.length - 1]).toFixed(1)} ${BOTTOM}L${X(BAND_HZ[0]).toFixed(1)} ${BOTTOM}Z`;
  });
  const matchPath = useMemo(() => {
    if (!fit) return '';
    const pts = BAND_HZ.map((f, i) => [f, -fit.deviation[i]] as const).filter((_, i) => fit.present[i]);
    return pts.map(([f, d], i) => `${i ? 'L' : 'M'}${X(f).toFixed(1)},${Y(clamp(d, -15, 15)).toFixed(1)}`).join(' ');
  }, [fit]);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      const node = (e.target as Element).closest('[data-eq-band]');
      if (!node || !e.deltaY) return;
      e.preventDefault();
      const index = Number(node.getAttribute('data-eq-band')), key = EQ_BANDS[index].q;
      select(index);
      const value = eqValue(current.current, key);
      setParam(key, clamp(value * Math.exp(-Math.sign(e.deltaY) * (e.shiftKey ? 0.015 : 0.12)), 0.2, 12));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [setParam]);
  const paths = useMemo(() => {
    const coefficients = readEqBands(params).map(b => eqCoefficients(b, sampleRate));
    const traces = [...coefficients.map(() => ''), ''];
    for (let i = 0; i <= 240; i++) {
      const x = LEFT + i / 240 * (RIGHT - LEFT), freq = 20 * Math.pow(1000, i / 240);
      const db = coefficients.map(c => eqResponseDb(c, freq, sampleRate));
      db.push(db.reduce((a, b) => a + b, 0));
      db.forEach((value, j) => { traces[j] += `${i ? 'L' : 'M'}${x.toFixed(2)},${Y(clamp(value, -30, 30)).toFixed(2)} `; });
    }
    return traces;
  }, [params, sampleRate]);
  const write = (key: string, value: number) => {
    const def = PARAMS[key];
    setParam(key, clamp(value, def.min!, def.max!));
  };
  const resetBand = (index: number) => {
    for (const key of Object.values(EQ_BANDS[index])) setParam(key, PARAMS[key].def);
  };

  return (
    <section className={`panel panel-eq${on ? '' : ' eq-bypassed'}`} style={{ gridArea: 'eq' }} aria-label="Four-band parametric equalizer">
      <div className="panel-head">
        {adapter.renderPower(prefix + "fx.eq.on")}
        <h2>EQ</h2>
        <span className="eq-caption">{on ? '4 BAND' : 'BYPASS'}</span>
        <button type="button" className={`eq-auto-toggle${autoOpen ? ' on' : ''}`} aria-pressed={autoOpen}
          title="Auto-EQ: match the spectrum to a reference" onClick={() => setAutoOpen(o => !o)}>AUTO</button>
        <div className="eq-bands" role="group" aria-label="Select EQ band">
          {bands.map((b, i) => <button key={i} type="button" aria-label={`Select EQ band ${i + 1}`}
            aria-pressed={selected === i} className={b.on ? '' : 'band-off'} onClick={() => select(i)}>{i + 1}</button>)}
        </div>
      </div>
      <svg ref={svg} className="eq-curve" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="EQ response. Drag nodes to set frequency and gain."
        onPointerMove={e => {
          const d = drag.current, rect = svg.current?.getBoundingClientRect();
          if (!d || !rect) return;
          const fine = e.shiftKey ? 0.15 : 1;
          const k = EQ_BANDS[d.index];
          const freq = clamp(d.freq * Math.pow(1000, (e.clientX - d.x) / rect.width * W / (RIGHT - LEFT) * fine), 20, 20000);
          const gain = clamp(d.gain - (e.clientY - d.y) / rect.height * H / (BOTTOM - TOP) * 30 * fine, -15, 15);
          write(k.freq, freq); write(k.gain, gain);
          drag.current = { index: d.index, x: e.clientX, y: e.clientY, freq, gain };
        }}
        onPointerUp={e => { drag.current = null; e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ac-n)" stopOpacity="0.23" />
            <stop offset="1" stopColor="var(--ac-n)" stopOpacity="0.02" />
          </linearGradient>
          <clipPath id={`${id}-clip`}><rect x={LEFT - 1} y={TOP - 1} width={RIGHT - LEFT + 2} height={BOTTOM - TOP + 2} /></clipPath>
        </defs>
        {[12, 0, -12].map(db => <g key={db} className="eq-grid">
          <line x1={LEFT} x2={RIGHT} y1={Y(db)} y2={Y(db)} className={db === 0 ? 'eq-zero' : ''} />
          <text x="20" y={Y(db) + 3} textAnchor="end">{db > 0 ? '+' : ''}{db}</text>
        </g>)}
        {[20, 100, 1000, 10000, 20000].map(freq => <g key={freq} className="eq-grid">
          <line x1={X(freq)} x2={X(freq)} y1={TOP} y2={BOTTOM} />
          <text x={X(freq)} y="120" textAnchor={freq === 20 ? 'start' : freq === 20000 ? 'end' : 'middle'}>{freq >= 1000 ? `${freq / 1000}k` : freq}</text>
        </g>)}
        <g clipPath={`url(#${id}-clip)`}>
          <path ref={live} className="eq-live" d="" aria-hidden="true" />
          <path d={`${paths[selected]} L${RIGHT},${Y(0)} L${LEFT},${Y(0)} Z`} fill={`url(#${id}-fill)`} />
          {paths.slice(0, 4).map((d, i) => <path key={i} d={d} className={`eq-band-curve${selected === i ? ' selected' : ''}`} />)}
          <path d={on ? paths[4] : `M${LEFT},${Y(0)} H${RIGHT}`} className="eq-sum" />
          {autoOpen && matchPath && <path d={matchPath} className="eq-auto-match"><title>Correction that would match the reference exactly</title></path>}
        </g>
        {bands.map((b, i) => <g key={i} className={`eq-node${selected === i ? ' selected' : ''}${b.on ? '' : ' disabled'}`}
          transform={`translate(${X(b.freq)}, ${Y(b.gain)})`} data-eq-band={i} tabIndex={0} role="button"
          aria-label={`EQ band ${i + 1}, ${fmtHz(b.freq)}, ${fmtDb(b.gain)}, Q ${b.q.toFixed(2)}${b.on ? '' : ', bypassed'}`}
          aria-pressed={selected === i} onFocus={() => select(i)}
          onPointerDown={e => {
            if (e.button !== 0) return;
            e.preventDefault(); select(i); e.currentTarget.focus();
            drag.current = { index: i, x: e.clientX, y: e.clientY, freq: b.freq, gain: b.gain };
            svg.current?.setPointerCapture(e.pointerId);
          }}
          onDoubleClick={() => resetBand(i)}
          onKeyDown={e => {
            const k = EQ_BANDS[i], fine = e.shiftKey ? 0.1 : 1;
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'Enter', ' '].includes(e.key)) {
              e.preventDefault(); e.stopPropagation();
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') write(k.freq, b.freq * Math.pow(2, (e.key === 'ArrowLeft' ? -1 : 1) * fine / 12));
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') write(k.gain, b.gain + (e.key === 'ArrowUp' ? 0.5 : -0.5) * fine);
              if (e.key === 'Home') resetBand(i);
              if (e.key === 'Enter' || e.key === ' ') select(i);
            }
          }}>
          <title>Band {i + 1}: drag frequency / gain · scroll Q · Shift for fine · double-click to reset</title>
          <circle r="12" className="eq-node-hit" /><circle r="7" className="eq-node-dot" />
          <text textAnchor="middle" dy="3">{i + 1}</text>
        </g>)}
      </svg>
      {autoOpen ? <AutoEqStrip analysis={analysis} params={params} setParam={setParam} sampleRate={sampleRate} onFit={setFit} /> : <>
      <div className="eq-band-tools">
        <button className="eq-enable" aria-label={`Enable EQ band ${selected + 1}`} aria-pressed={band.on}
          onClick={() => setParam(keys.on, band.on ? 0 : 1)}><span />BAND {selected + 1}</button>
        <select aria-label={`EQ band ${selected + 1} shape`} value={band.type} onChange={e => setParam(keys.type, Number(e.target.value))}>
          <option value={0}>LOW SHELF</option><option value={1}>BELL</option><option value={2}>HIGH SHELF</option>
        </select>
        <button className="eq-reset" onClick={() => resetBand(selected)} title="Reset selected band">RESET</button>
      </div>
      <div className="eq-controls">
        {(['freq', 'gain', 'q'] as const).map(key => <div className="eq-control" key={`${selected}-${key}`}>
          {adapter.renderKnob(prefix + keys[key], key)}
          <output>{PARAMS[keys[key]].fmt!(eqValue(params, keys[key]))}</output>
        </div>)}
      </div>
      </>}
    </section>
  );
}
