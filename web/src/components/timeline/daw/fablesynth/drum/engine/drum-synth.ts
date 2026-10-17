// Main-thread DR-1 engine: owns the AudioContext, drum worklet and FX graph.

import { KEY_CHANNELS } from '../../engine/sidechain';
import { guardAudioNavigation } from '../../shared/audioNavigationGuard';
import { generateTables, type GeneratedTable } from '../../engine/wavetables';
import { type ParamValues } from '../../params';
import { defaultDrumParams, OUT_NAMES, PAD_COUNT, pad } from '../params';
import { generateDrumTables } from './drumtables';
import { generateSampledDrumTables } from './sampledtables.gen';
import { loadDrumOneShots, type DrumOneShot } from './oneshots.gen';
import workletUrl from './worklet-drum.js?url';
import labWorkletUrl from '../../engine/lab-worklet.js?url';
import ottWorkletUrl from '../../engine/ott-worklet.js?url';
import type { DynamicsMessage } from '../../engine/dynamics';
import type { EchoMessage } from '../../engine/echo';
import type { ReverbMessage } from '../../engine/reverb';
import { cloneDrumRhythm, type DrumRhythm } from '../rhythm';

export interface VizTable {
  name: string;
  frames: number;
  viz: Float32Array;
}

export interface StepMessage {
  t: 'step';
  s: number;
  pat: number;
  hits: number[];
}

export interface DrumVizMessage {
  t: 'viz';
  a: number;
  b: number;
  env: number;
  lanes?: number[];
}

// One output bus per OUT_NAMES entry. The FX rack — per-pad drive, compressor,
// chorus and delay, the shared reverbs and the per-bus gain/DC/limiter — now
// runs inside the worklet (review W6, docs/audio-engine-review.md §3). The
// native graph is only the meter tap and the route to the device.
const BUS_COUNT = OUT_NAMES.length;
/** Node output carrying pad 01 (KICK) alone, for SQ-4 side-chain keys. */
export const KICK_KEY_OUTPUT = BUS_COUNT;

// Hosted-mode options (SQ-4): share an AudioContext and route the engine's
// output into a provided node instead of ctx.destination. Defaults keep the
// standalone behavior byte-for-byte. See docs/sq4-clips.md §7.
export interface EngineInitOpts {
  ctx?: AudioContext;
  output?: AudioNode;
}

export const isFxParam = (id: string): boolean =>
  id.startsWith('fx.') || /^pad(?:[0-9]|1[0-5])\.fx\./.test(id) || id === 'master.volume';

export function fxPadFromParam(id: string): number | null {
  const match = /^pad([0-9]|1[0-5])\.fx\./.exec(id);
  return match ? Number(match[1]) : null;
}

/** One block of a pad's post-FX mono signal; `frames` counts samples since capture began. */
export interface PadAudioMessage { t: 'padAudio'; pad: number; frames: number; data: Float32Array }

export class DrumEngine {
  private dynamicsListeners = new Set<(message: DynamicsMessage) => void>();
  private echoListeners = new Set<(message: EchoMessage) => void>();
  private reverbListeners = new Set<(message: ReverbMessage) => void>();
  private padAudioListeners = new Set<(message: PadAudioMessage) => void>();
  private meterPad = 0;
  private meterBus = 0;

  setMeterPad(padIndex: number): void {
    this.meterPad = Math.max(0, Math.min(PAD_COUNT - 1, padIndex | 0));
    this.meterBus = Math.max(0, Math.min(BUS_COUNT - 1, this.params[pad(this.meterPad, 'out')] | 0));
    if (this.ready) this.node.port.postMessage({ t: 'meterPad', pad: this.meterPad });
  }

  subscribeDynamics(listener: (message: DynamicsMessage) => void): () => void {
    this.dynamicsListeners.add(listener);
    if (this.ready && this.dynamicsListeners.size === 1) this.node.port.postMessage({ t: 'dynamics', on: true });
    return () => {
      this.dynamicsListeners.delete(listener);
      if (this.ready && !this.dynamicsListeners.size) this.node.port.postMessage({ t: 'dynamics', on: false });
    };
  }
  subscribeEcho(listener: (message: EchoMessage) => void): () => void {
    this.echoListeners.add(listener);
    if (this.ready && this.echoListeners.size === 1) this.node.port.postMessage({ t: 'echo', on: true });
    return () => {
      this.echoListeners.delete(listener);
      if (this.ready && !this.echoListeners.size) this.node.port.postMessage({ t: 'echo', on: false });
    };
  }
  /** Streams each live pad's post-FX mono audio for kit auto-mix while subscribed. */
  subscribePadAudio(listener: (message: PadAudioMessage) => void): () => void {
    this.padAudioListeners.add(listener);
    if (this.ready && this.padAudioListeners.size === 1) this.node.port.postMessage({ t: 'padCapture', on: true });
    return () => {
      this.padAudioListeners.delete(listener);
      if (this.ready && !this.padAudioListeners.size) this.node.port.postMessage({ t: 'padCapture', on: false });
    };
  }
  subscribeReverb(listener: (message: ReverbMessage) => void): () => void {
    this.reverbListeners.add(listener);
    if (this.ready && this.reverbListeners.size === 1) this.node.port.postMessage({ t: 'reverb', on: true });
    return () => {
      this.reverbListeners.delete(listener);
      if (this.ready && !this.reverbListeners.size) this.node.port.postMessage({ t: 'reverb', on: false });
    };
  }
  params: ParamValues;
  tables: VizTable[] | null;
  builtInTables: GeneratedTable[];
  userTables: GeneratedTable[];
  samples: DrumOneShot[];
  ready: boolean;
  onlanepos: ((positions: number[]) => void) | null = null;
  onstep: ((d: { s: number; pat: number; hits: number[] }) => void) | null;
  onviz: ((d: { a: number; b: number; env: number }) => void) | null;
  onclipstart: ((frame: number) => void) | null;
  onclipstop: ((frame: number) => void) | null;
  onpos: ((d: { step: number; bar: number }) => void) | null;
  // Pads triggered by a hosted clip step, so the UI can flash their LEDs.
  // Standalone playback reports hits via onstep instead.
  onhit: ((pads: number[]) => void) | null;
  output: AudioNode | null; // hosted-mode output (null = ctx.destination)

  ctx!: AudioContext;
  node!: AudioWorkletNode;

  scopeAnalyser!: AnalyserNode;
  // Chain latency reported by the worklet: drive FIR group delay + limiter
  // lookahead (142 samples at 48 kHz), the same figure the plugin reports.
  latencySamples: number;
  // Standalone transport anchor frame (worklet clock), -1 while stopped.
  transportAnchor = -1;

  constructor() {
    this.params = defaultDrumParams();
    this.tables = null;
    this.builtInTables = [];
    this.userTables = [];
    this.samples = [];
    this.ready = false;
    this.onstep = null;
    this.onviz = null;
    this.onclipstart = null;
    this.onclipstop = null;
    this.onpos = null;
    this.onhit = null;
    this.output = null;
    this.latencySamples = 0;
  }

  async init(opts: EngineInitOpts = {}): Promise<void> {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = opts.ctx ?? new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.output = opts.output ?? null;
    await ctx.audioWorklet.addModule(ottWorkletUrl);
    await ctx.audioWorklet.addModule(labWorkletUrl);
    await ctx.audioWorklet.addModule(workletUrl);

    this.builtInTables = [...generateDrumTables(), ...generateTables(), ...generateSampledDrumTables()];
    this.samples = await loadDrumOneShots();
    this.refreshViz();

    this.node = new AudioWorkletNode(ctx, 'fable-dr', {
      // Side-chain key bus (src/engine/sidechain.ts); unconnected when standalone.
      numberOfInputs: 1, channelCount: KEY_CHANNELS, channelCountMode: 'explicit', channelInterpretation: 'discrete',
      // One stereo output per bus, plus a mono KICK key (pad 01) at BUS_COUNT.
      numberOfOutputs: BUS_COUNT + 1,
      outputChannelCount: [...Array(BUS_COUNT).fill(2), 1],
    });
    this.node.port.onmessage = (e: MessageEvent) => {
      if (e.data.t === 'step' && this.onstep) this.onstep(e.data as StepMessage);
      if (e.data.t === 'viz' && Array.isArray(e.data.lanes)) this.onlanepos?.(e.data.lanes);
      if (e.data.t === 'viz' && this.onviz) this.onviz(e.data as DrumVizMessage);
      if (e.data.t === 'pos') {
        if (this.onpos) this.onpos({ step: e.data.step as number, bar: e.data.bar as number });
        const hits = e.data.hits as number[] | undefined;
        if (this.onhit && hits && hits.length) this.onhit(hits);
      }
      if (e.data.t === 'padAudio') this.padAudioListeners.forEach(listener => listener(e.data as PadAudioMessage));
      if (e.data.t === 'latency') this.latencySamples = e.data.n as number;
      if (e.data.t === 'anchor') this.transportAnchor = e.data.frame as number;
      if (e.data.t === 'clipstart' && this.onclipstart) this.onclipstart(e.data.frame as number);
      if (e.data.t === 'clipstop' && this.onclipstop) this.onclipstop(e.data.frame as number);
      if (e.data.t === 'dynamics' && (e.data.pad === undefined || e.data.pad === this.meterPad)) this.dynamicsListeners.forEach(listener => listener(e.data as DynamicsMessage));
      if (e.data.t === 'echo' && (e.data.pad === undefined || e.data.pad === this.meterPad)) this.echoListeners.forEach(listener => listener(e.data as EchoMessage));
      if (e.data.t === 'reverb' && (e.data.pad === undefined || e.data.pad === this.meterPad) && (e.data.bus === undefined || e.data.bus === this.meterBus)) this.reverbListeners.forEach(listener => listener(e.data as ReverbMessage));
    };
    this.node.port.postMessage({ t: 'init', params: this.params });
    this.ready = true;
    guardAudioNavigation(ctx);
    if (this.dynamicsListeners.size) this.node.port.postMessage({ t: 'dynamics', on: true });
    if (this.echoListeners.size) this.node.port.postMessage({ t: 'echo', on: true });
    if (this.reverbListeners.size) this.node.port.postMessage({ t: 'reverb', on: true });
    this.node.port.postMessage({ t: 'meterPad', pad: this.meterPad });
    this.pushTables();
    this.pushSamples();

    this.buildOut();
  }

  allTables(): GeneratedTable[] {
    return [...this.builtInTables, ...this.userTables];
  }

  refreshViz(): void {
    this.tables = this.allTables().map((t) => ({ name: t.name, frames: t.frames, viz: t.viz }));
  }

  pushTables(): void {
    if (!this.ready) return;
    const all = this.allTables();
    this.node.port.postMessage({
      t: 'tables',
      list: all.map((t) => ({ frames: t.frames, mips: t.mips, size: t.size, buf: t.data.slice().buffer })),
    });
  }

  pushSamples(): void {
    if (!this.ready) return;
    this.node.port.postMessage({
      t: 'samples',
      list: this.samples.map((s) => ({
        sampleRate: s.sampleRate,
        buf: s.data.slice().buffer,
      })),
    });
  }

  setUserTables(tables: GeneratedTable[]): void {
    this.userTables = tables;
    this.refreshViz();
    this.pushTables();
  }

  // ---------- output graph ----------
  // Each worklet output is one finished bus: it already carries that bus's
  // gain, DC block and -1 dBFS limiter. Nothing is left to do here but meter
  // it and hand it to the device.
  buildOut(): void {
    if (!this.ready) return;
    const ctx = this.ctx;
    this.scopeAnalyser = ctx.createAnalyser();
    this.scopeAnalyser.fftSize = 2048;
    const dest = this.output ?? ctx.destination;
    for (let b = 0; b < BUS_COUNT; b++) {
      this.node.connect(dest, b);
      this.node.connect(this.scopeAnalyser, b);
    }
  }

  // ---------- parameter + transport API ----------
  setParam(id: string, v: number): void {
    this.params[id] = v;
    if (id === pad(this.meterPad, 'out')) this.meterBus = Math.max(0, Math.min(BUS_COUNT - 1, v | 0));
    if (!this.ready) return;
    this.node.port.postMessage({ t: 'p', k: id, v });
  }

  applyAllParams(): void {
    if (!this.ready) return;
    this.node.port.postMessage({ t: 'init', params: this.params });
  }

  trigger(pad: number, vel: number): void {
    if (this.ready) this.node.port.postMessage({ t: 'trig', pad, v: vel });
  }

  play(): void {
    if (this.ready) this.node.port.postMessage({ t: 'play' });
  }

  stop(): void {
    if (this.ready) this.node.port.postMessage({ t: 'stop' });
    this.transportAnchor = -1;
  }

  /** Standalone transport position in sixteenth steps, or null while stopped. */
  transportSteps(bpm: number): number | null {
    if (!this.ready || this.transportAnchor < 0) return null;
    const stepFrames = (this.ctx.sampleRate * 60) / Math.max(1, bpm) / 4;
    return Math.max(0, (this.ctx.currentTime * this.ctx.sampleRate - this.transportAnchor) / stepFrames);
  }

  setPatterns(p: Uint8Array): void {
    if (this.ready) this.node.port.postMessage({ t: 'pats', data: p.slice().buffer });
  }

  setChain(c: number[]): void {
    if (this.ready) this.node.port.postMessage({ t: 'chain', list: c });
  }

  setSequence(patterns: Uint8Array, chain: number[], rhythm?: DrumRhythm): void {
    if (this.ready) this.node.port.postMessage({ t: 'seq', data: patterns.slice().buffer, chain: [...chain], rhythm: cloneDrumRhythm(rhythm, 4) });
  }

  selectPad(i: number): void {
    if (this.ready) this.node.port.postMessage({ t: 'sel', pad: i });
    this.setMeterPad(i);
  }

  // Hosted preset changes reset voices while preserving active and queued clips.
  panic(preserveTransport = false): void {
    if (this.ready) this.node.port.postMessage({ t: 'panic', preserveTransport });
  }

  // ---------- hosted clip transport (SQ-4, docs/sq4-clips.md §6) ----------
  setHostMode(on: boolean): void {
    if (this.ready) this.node.port.postMessage({ t: 'host', on: on ? 1 : 0 });
  }

  setTempo(bpm: number, swing: number, anchor: number): void {
    if (this.ready) this.node.port.postMessage({ t: 'tempo', bpm, swing, anchor });
  }

  scheduleClip(data: Uint8Array, bars: number, atFrame: number, rhythm?: DrumRhythm): void {
    if (this.ready) this.node.port.postMessage({ t: 'clip', data, bars, atFrame, ...(rhythm ? { rhythm: cloneDrumRhythm(rhythm, bars) } : {}) });
  }

  scheduleStop(atFrame: number): void {
    if (this.ready) this.node.port.postMessage({ t: 'clipstop', atFrame });
  }

  /** Standalone sequence automation: plays while the DR-1 transport runs. */
  setSequenceAutomation(lanes: { k: string; table: Float32Array; len: number; fit: number; rot: number }[]): void {
    if (this.ready) this.node.port.postMessage({ t: 'seqauto', lanes });
  }

  /** Hosted clip automation: absolute-value tables per parameter (SQ-4). */
  setClipAutomation(lanes: { k: string; table: Float32Array; len: number; fit: number; rot: number }[]): void {
    if (this.ready) this.node.port.postMessage({ t: 'auto', lanes });
  }
  updateClip(data: Uint8Array, bars: number, rhythm?: DrumRhythm): void {
    if (this.ready) this.node.port.postMessage({ t: 'clipupdate', data, bars, rhythm: cloneDrumRhythm(rhythm, bars) ?? null });
  }
}
