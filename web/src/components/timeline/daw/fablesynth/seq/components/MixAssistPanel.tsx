// Master-bus assistant: listen to the running session, compare its tonal
// balance with a target, and propose EQ, dynamics, loudness and fader moves.
// The plan is a preview until APPLY; REVERT restores the snapshot taken then.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSeqStore } from '../store';
import type { MasterFxParams } from '../masterFx';
import { BAND_HZ, MIX_ROLES, MixListener, analyse, buildPlan, type LoudnessTarget, type MixAnalysis, type MixRole, type TrackLevel } from '../mixAssistant';
import { EQ_REFERENCES, alignToReference, referenceById, referenceDb } from '../../engine/autoEq';
import { useLiveSpectrum } from '../../components/panels/useLiveSpectrum';

const LISTEN_SECONDS = 12, TIMEOUT_SECONDS = 45, MIN_SECONDS = 3;
const TARGETS: { v: LoudnessTarget; label: string }[] = [{ v: -14, label: 'STREAM −14' }, { v: -11, label: '−11' }, { v: -9, label: 'CLUB −9' }];

const W = 360, H = 132, L = 26, R = 350, T = 10, B = 114;
const X = (f: number) => L + Math.log(f / 25) / Math.log(20000 / 25) * (R - L);
const Y = (d: number) => T + (18 - Math.max(-30, Math.min(18, d))) / 48 * (B - T);
const line = (ys: number[]) => ys.map((d, i) => `${i ? 'L' : 'M'}${X(BAND_HZ[i]).toFixed(1)} ${Y(d).toFixed(1)}`).join('');
const fmtLufs = (v: number) => Number.isFinite(v) ? `${v.toFixed(1)}` : '—';

type Snapshot = { masterFx: MasterFxParams; trackVol: number[]; masterVol: number };

export function MixAssistPanel() {
  const rig = useSeqStore(s => s.rig), playing = useSeqStore(s => s.playing);
  const bpm = useSeqStore(s => s.session.bpm), tracks = useSeqStore(s => s.session.tracks);
  const [reference, setReference] = useState('mix');
  const [loudness, setLoudness] = useState<LoudnessTarget>(-11);
  const [amount, setAmount] = useState(0.7);
  const [listening, setListening] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analysis, setAnalysis] = useState<MixAnalysis | null>(null);
  // `base` is the mixer state the analysis heard; `snapshot` is the state
  // before the first APPLY, kept for REVERT across re-listens.
  const [base, setBase] = useState<Snapshot | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [roles, setRoles] = useState<(MixRole | null)[]>([]);
  const timer = useRef<number | null>(null);
  const listener = useRef<MixListener | null>(null);
  const taps = rig?.masterTaps ?? null;

  const detach = useRef<() => void>(() => {});
  const stop = (finish: boolean) => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    detach.current(); detach.current = () => {};
    setListening(false);
    const l = listener.current;
    if (finish && l && l.frames * l.fftSize / l.sampleRate >= MIN_SECONDS) setAnalysis(analyse(l));
  };
  useEffect(() => () => { if (timer.current !== null) window.clearInterval(timer.current); detach.current(); }, []);

  const listen = () => {
    if (!taps || !rig) return;
    if (listening) { stop(true); return; }
    const fft = taps.input.fftSize, sr = rig.sampleRate;
    const l = new MixListener(sr, fft, tracks.length);
    listener.current = l;
    const spec = new Float32Array(taps.input.frequencyBinCount), input = new Float32Array(fft), output = new Float32Array(taps.output.fftSize);
    // The scope analysers are too short for low bands, so each track gets a
    // full-size tap (analysers pass audio through) while the assistant listens.
    const trackTaps = (rig.trackAnalysers ?? []).map(a => {
      const t = Object.assign(a.context.createAnalyser(), { fftSize: fft, smoothingTimeConstant: 0 });
      a.connect(t);
      return { src: a, tap: t, frame: { time: new Float32Array(fft), spectrum: new Float32Array(fft / 2) } };
    });
    detach.current = () => trackTaps.forEach(({ src, tap }) => { try { src.disconnect(tap); } catch { /* already gone */ } });
    const started = performance.now();
    const st = useSeqStore.getState();
    setBase({ masterFx: st.masterFx, trackVol: st.trackVol.slice(), masterVol: st.masterVol });
    setListening(true); setProgress(0);
    // Poll once per analyser window so successive frames barely overlap.
    timer.current = window.setInterval(() => {
      taps.input.getFloatFrequencyData(spec);
      taps.input.getFloatTimeDomainData(input);
      taps.output.getFloatTimeDomainData(output);
      trackTaps.forEach(({ tap, frame }) => { tap.getFloatTimeDomainData(frame.time); tap.getFloatFrequencyData(frame.spectrum); });
      l.add(spec, input, output, tracks.map((_, i) => trackTaps[i]?.frame ?? null));
      const heard = l.frames * fft / sr;
      setProgress(Math.min(1, heard / LISTEN_SECONDS));
      if (heard >= LISTEN_SECONDS || performance.now() - started > TIMEOUT_SECONDS * 1000) stop(true);
    }, fft / sr * 1000);
  };

  // Plan against the state the analysis heard, so the preview does not chase
  // its own changes after they land.
  const plan = useMemo(() => analysis && base && buildPlan({
    analysis, reference, loudness, amount, bpm, sampleRate: rig?.sampleRate ?? 48000,
    masterFx: base.masterFx, masterVol: base.masterVol, trackVol: base.trackVol,
    tracks: tracks.map(t => ({ machine: t.machine, name: t.name })), roles,
  }), [analysis, base, reference, loudness, amount, bpm, rig, tracks, roles]);
  const setRole = (i: number, r: MixRole | null) => setRoles(prev => { const n = tracks.map((_, k) => prev[k] ?? null); n[i] = r; return n; });

  const apply = () => {
    if (!plan || !base) return;
    const st = useSeqStore.getState();
    if (!snapshot) setSnapshot({ masterFx: st.masterFx, trackVol: st.trackVol.slice(), masterVol: st.masterVol });
    // Re-applying after a target change starts from the same baseline.
    st.setMasterFx({ ...base.masterFx, ...plan.masterFx });
    base.trackVol.forEach((v, i) => st.setTrackVol(i, plan.trackVol[i] ?? v));
    st.setMasterVol(plan.masterVol ?? base.masterVol);
  };
  const revert = () => {
    if (!snapshot) return;
    const st = useSeqStore.getState();
    st.setMasterFx(snapshot.masterFx);
    snapshot.trackVol.forEach((v, i) => st.setTrackVol(i, v));
    st.setMasterVol(snapshot.masterVol);
    setSnapshot(null);
  };

  const ref = referenceById(reference);
  const target = BAND_HZ.map(f => referenceDb(ref, f));
  // Live post-FX spectrum, aligned to the reference like the measured curve.
  const live = useLiveSpectrum(playing ? taps?.output ?? null : null, (levels) => {
    const { offset } = alignToReference(levels, ref);
    const pts = levels.map((l, i) => `${i ? 'L' : 'M'}${X(BAND_HZ[i]).toFixed(1)} ${Y(l - offset).toFixed(1)}`).join('');
    return `${pts}L${X(BAND_HZ[BAND_HZ.length - 1]).toFixed(1)} ${B}L${X(BAND_HZ[0]).toFixed(1)} ${B}Z`;
  });
  const caption = listening ? `LISTENING ${Math.round(progress * 100)}%` : snapshot ? 'APPLIED' : analysis ? `${analysis.seconds.toFixed(0)} s ANALYSED` : playing ? 'READY' : 'START PLAYBACK';
  return <section className={`panel sq-assist-panel${listening ? ' listening' : ''}`} style={{ gridArea: 'assist' }} aria-label="Master assistant">
    <div className="panel-head"><h2>ASSIST</h2><span className="dynamics-caption">{caption}</span><span className="dynamics-legend">PRE-FX ANALYSIS · {ref.label}</span></div>
    <div className="sq-assist-body">
      <div className="sq-assist-scope">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Measured tonal balance against the target">
          <g className="sq-assist-grid">
            {[50, 100, 200, 500, 1000, 2000, 5000, 10000].map(f => <g key={f}><path d={`M${X(f)} ${T}V${B}`} /><text x={X(f)} y={H - 6} textAnchor="middle">{f >= 1000 ? `${f / 1000}k` : f}</text></g>)}
            {[12, 0, -12, -24].map(d => <g key={d}><path d={`M${L} ${Y(d)}H${R}`} /><text x={L - 4} y={Y(d) + 3} textAnchor="end">{d}</text></g>)}
          </g>
          <path className="sq-assist-target" d={`${line(target.map(d => d + 3))}${target.map((_, i) => `L${X(BAND_HZ[target.length - 1 - i]).toFixed(1)} ${Y(target[target.length - 1 - i] - 3).toFixed(1)}`).join('')}Z`} />
          <path ref={live} className="sq-assist-live" d="" />
          {plan && <path className="sq-assist-measured" d={line(plan.eq.measured)} />}
          {plan && <path className="sq-assist-corrected" d={line(plan.eq.measured.map((d, i) => plan.eq.present[i] ? target[i] + plan.eq.residual[i] : d))} />}
        </svg>
        <div className="sq-assist-legend"><span className="t">TARGET ±3 dB</span><span className="l">LIVE OUT</span><span className="m">MEASURED</span><span className="c">AFTER EQ</span></div>
      </div>
      <div className="sq-assist-side">
        <dl className="sq-assist-meters">
          <div><dt>IN</dt><dd>{analysis ? fmtLufs(analysis.lufsIn) : '—'}<small>LUFS</small></dd></div>
          <div><dt>OUT</dt><dd>{analysis ? fmtLufs(analysis.lufsOut) : '—'}<small>LUFS</small></dd></div>
          <div><dt>PEAK</dt><dd>{analysis ? analysis.peakDb.toFixed(1) : '—'}<small>dBFS</small></dd></div>
          <div><dt>CREST</dt><dd>{analysis ? analysis.crestDb.toFixed(1) : '—'}<small>dB</small></dd></div>
        </dl>
        <select className="sq-assist-ref" aria-label="Tonal reference" value={reference} title={ref.hint} onChange={e => setReference(e.target.value)}>
          {EQ_REFERENCES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <div className="sq-assist-seg" role="radiogroup" aria-label="Loudness target">
          {TARGETS.map(t => <button key={t.v} type="button" role="radio" aria-checked={loudness === t.v} className={loudness === t.v ? 'on' : ''} onClick={() => setLoudness(t.v)}>{t.label}</button>)}
        </div>
        <label className="sq-assist-amount"><span>AMOUNT</span><input type="range" min={0} max={1} step={0.05} value={amount} onChange={e => setAmount(+e.target.value)} /><output>{Math.round(amount * 100)}%</output></label>
        <div className="sq-assist-actions">
          <button type="button" className={`sq-assist-listen${listening ? ' on' : ''}`} disabled={!taps || (!playing && !listening)} onClick={listen}
            style={{ '--p': progress } as React.CSSProperties}>{listening ? 'STOP' : analysis ? 'RE-LISTEN' : 'LISTEN'}</button>
          <button type="button" disabled={!plan || listening} onClick={apply}>{snapshot ? 'RE-APPLY' : 'APPLY'}</button>
          <button type="button" disabled={!snapshot} onClick={revert}>REVERT</button>
        </div>
      </div>
      <div className="sq-assist-moves">
        {plan ? <>
          <ul>{plan.moves.map(m => <li key={m.id}><span>{m.label}</span><s>{m.from}</s><b>{m.to}</b></li>)}</ul>
          {plan.notes.map(n => <p key={n}>{n}</p>)}
        </> : <p>Play a full scene, then press LISTEN. The assistant hears the pre-FX mix for {LISTEN_SECONDS} s and proposes master EQ, dynamics, loudness and fader moves.</p>}
      </div>
      {plan && plan.levels.length > 0 && <LevelTable levels={plan.levels} roles={roles} setRole={setRole} />}
    </div>
  </section>;
}

// Track balance: each row shows the measured level, the role target and the
// planned move on a scale where the drum role sits at 0 LU.
const LU_MIN = -16, LU_MAX = 4;
const pos = (v: number) => `${(Math.max(LU_MIN, Math.min(LU_MAX, v)) - LU_MIN) / (LU_MAX - LU_MIN) * 100}%`;

function LevelTable({ levels, roles, setRole }: { levels: TrackLevel[]; roles: (MixRole | null)[]; setRole: (i: number, r: MixRole | null) => void }) {
  return <div className="sq-assist-levels" role="table" aria-label="Track levels">
    {levels.map(l => <div key={l.index} className="sq-assist-level" role="row">
      <span className="name" role="cell">{l.name}</span>
      <select role="cell" aria-label={`${l.name} role`} className={roles[l.index] ? 'set' : ''} value={roles[l.index] ?? ''}
        onChange={e => setRole(l.index, (e.target.value || null) as MixRole | null)}>
        <option value="">AUTO · {l.detected.toUpperCase()}</option>
        {MIX_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select>
      <span className="bar" role="cell" title={`${l.current.toFixed(1)} LU now, target ${l.target.toFixed(1)} LU`}>
        <i className="now" style={{ width: pos(l.current) }} />
        {l.move !== 0 && <i className="after" style={{ left: pos(Math.min(l.current, l.current + l.move)), width: `${Math.abs(l.move) / (LU_MAX - LU_MIN) * 100}%` }} />}
        <i className="target" style={{ left: pos(l.target) }} />
      </span>
      <b role="cell" className={l.move ? '' : 'hold'}>{l.move ? `${l.move > 0 ? '+' : ''}${l.move.toFixed(1)}` : 'HOLD'}</b>
    </div>)}
  </div>;
}

