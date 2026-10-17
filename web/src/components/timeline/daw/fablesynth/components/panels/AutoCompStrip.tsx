// Auto-comp controls for the compressor panel. LEARN collects ~33 ms blocks
// of the compressor's input (RMS plus the per-sample detector trace), the fit
// runs the compressor's own detector to pick threshold/ratio/attack/release
// for the chosen style, and APPLY writes them. UNDO restores the settings
// from before APPLY.
import { useEffect, useMemo, useRef, useState } from 'react';
import { BLOCK_RATE, COMP_STYLES, compStyleById, fitComp } from '../../engine/autoComp';
import type { FxTelemetryEngine } from './fxAdapter';

const LEARN_SECONDS = 8, SPARSE_SECONDS = 12, TIMEOUT_SECONDS = 30;
const KEYS = ['on', 'thr', 'ratio', 'att', 'rel'] as const;

export interface AutoCompTap {
  /** Analyser source used when the engine has no compressor telemetry. */
  source: AudioNode | null;
  /** True when `source` is after the compressor: LEARN bypasses it meanwhile. */
  postComp?: boolean;
  /** Default style id for this device. */
  style?: string;
  note?: string;
}

interface Props {
  engine: FxTelemetryEngine;
  tap?: AutoCompTap;
  /** Full param id for a comp key, including any pad prefix. */
  id: (key: string) => string;
  params: Record<string, number>;
  setParam: (id: string, value: number) => void;
}

export function AutoCompStrip({ engine, tap, id, params, setParam }: Props) {
  const [styleId, setStyleId] = useState(tap?.style ?? 'glue');
  const [depth, setDepth] = useState(1);
  const [progress, setProgress] = useState<number | null>(null);
  const [learned, setLearned] = useState<{ blocks: number[]; traces: (Float32Array | null)[]; sampleRate: number } | null>(null);
  const [undo, setUndo] = useState<Record<string, number> | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const style = compStyleById(styleId);
  const fit = useMemo(() => learned && fitComp(learned.blocks, style, depth, learned), [learned, style, depth]);
  useEffect(() => () => stopRef.current?.(), []);

  const learn = () => {
    if (stopRef.current) { stopRef.current(); return; }
    const collected: number[] = [], traces: (Float32Array | null)[] = [];
    let audible = 0, detach = () => {}, sampleRate = engine.ctx?.sampleRate ?? 48000;
    const started = performance.now();
    const push = (db: number, trace?: Float32Array) => {
      collected.push(db); traces.push(trace?.length ? trace : null);
      if (db > -60) audible++;
      setProgress(Math.min(1, audible / BLOCK_RATE / LEARN_SECONDS));
      // A sparse part (a single pad) may never fill the window; take what
      // twelve seconds gave once there is at least a second of sound.
      if (audible >= LEARN_SECONDS * BLOCK_RATE || (performance.now() - started > SPARSE_SECONDS * 1000 && audible >= BLOCK_RATE)) stop();
    };
    // A post-comp tap would hear its own compression, so bypass it while learning.
    const wasOn = params[id('on')];
    const bypass = !!tap?.source && tap.postComp && wasOn > 0.5;
    if (tap?.source) {
      const src = tap.source, an = src.context.createAnalyser();
      an.fftSize = 2048; src.connect(an);
      sampleRate = src.context.sampleRate;
      const buf = new Float32Array(an.fftSize), n = Math.round(sampleRate / BLOCK_RATE);
      // The analyser is a mono downmix, so its |x| stands in for max |L|,|R|.
      const timer = window.setInterval(() => {
        an.getFloatTimeDomainData(buf);
        const trace = new Float32Array(n);
        let s = 0;
        for (let i = 0; i < n; i++) { const v = buf[buf.length - n + i]; s += v * v; trace[i] = Math.abs(v); }
        push(10 * Math.log10(Math.max(1e-12, s / n)), trace);
      }, 1000 / BLOCK_RATE);
      detach = () => { window.clearInterval(timer); try { src.disconnect(an); } catch { /* already gone */ } };
    } else {
      detach = engine.subscribeDynamics(m => push(m.comp.input, m.comp.trace));
    }
    if (bypass) setParam(id('on'), 0);
    const timeout = window.setTimeout(() => stop(), TIMEOUT_SECONDS * 1000);
    const stop = () => {
      detach(); window.clearTimeout(timeout);
      if (bypass) setParam(id('on'), wasOn);
      stopRef.current = null;
      setProgress(null);
      if (collected.length >= BLOCK_RATE * 2) setLearned({ blocks: collected, traces, sampleRate });
    };
    stopRef.current = stop;
    setProgress(0);
  };

  const apply = () => {
    if (!fit) return;
    if (!undo) setUndo(Object.fromEntries(KEYS.map(k => [id(k), params[id(k)]])));
    setParam(id('thr'), fit.threshold); setParam(id('ratio'), fit.ratio);
    setParam(id('att'), fit.attack); setParam(id('rel'), fit.release); setParam(id('on'), 1);
  };
  const revert = () => {
    if (!undo) return;
    for (const [k, v] of Object.entries(undo)) if (v !== undefined) setParam(k, v);
    setUndo(null);
  };

  const unavailable = !tap?.source && tap?.note;
  const status = unavailable ? tap!.note!
    : progress !== null ? `LISTENING ${Math.round(progress * 100)}%`
    : fit ? `${fit.threshold.toFixed(1)} dB · ${fit.ratio}:1 · ${(fit.attack * 1000).toFixed(fit.attack < 0.001 ? 1 : 0)}/${Math.round(fit.release * 1000)} ms · ≈${fit.loudGr.toFixed(1)} dB GR${fit.bpm ? ` · ${fit.bpm} BPM` : ''}${fit.exact ? '' : ' · EST'}${fit.threshold <= -40 && fit.loudGr < style.targetGr * depth - 0.5 ? ' · TOO QUIET FOR THIS STYLE' : ''}`
    : 'PLAY, THEN LEARN';

  // Histogram of the blocks' mean detector level with the fitted threshold.
  const hist = useMemo(() => {
    if (!fit) return null;
    const bins = new Array(30).fill(0);
    for (const v of fit.levels) bins[Math.max(0, Math.min(29, Math.floor((v + 60) / 2)))]++;
    const max = Math.max(...bins);
    return bins.map(b => b / max);
  }, [fit]);

  return <div className="comp-auto">
    <div className="comp-auto-row">
      <select aria-label="Auto-comp style" value={styleId} title={style.hint} onChange={e => setStyleId(e.target.value)}>
        {COMP_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <label className="comp-auto-depth" title="Scales the style's gain reduction">
        <input type="range" min={0.25} max={2} step={0.05} value={depth} aria-label="Auto-comp depth" onChange={e => setDepth(+e.target.value)} />
        <output>{Math.round(depth * 100)}%</output>
      </label>
    </div>
    {hist && fit && <svg className="comp-auto-hist" viewBox="0 0 300 34" preserveAspectRatio="none" role="img"
      aria-label={`Input level histogram, threshold ${fit.threshold.toFixed(1)} dB`}>
      {hist.map((h, i) => <rect key={i} x={i * 10 + 1} y={32 - h * 28} width={8} height={h * 28} className={i * 2 - 60 >= fit.threshold ? 'over' : ''} />)}
      <line x1={(fit.threshold + 60) * 5} x2={(fit.threshold + 60) * 5} y1={0} y2={34} />
    </svg>}
    <div className="comp-auto-row">
      <button type="button" className={`comp-auto-learn${progress !== null ? ' on' : ''}`} disabled={!!unavailable}
        style={{ '--p': progress ?? 0 } as React.CSSProperties} onClick={learn}>{progress !== null ? 'STOP' : learned ? 'RELEARN' : 'LEARN'}</button>
      <button type="button" disabled={!fit || progress !== null} onClick={apply}>APPLY</button>
      <button type="button" disabled={!undo} onClick={revert}>UNDO</button>
    </div>
    <p className="comp-auto-status">{status}</p>
  </div>;
}
