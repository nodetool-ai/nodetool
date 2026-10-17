import { KEY_CHANNELS } from '../../engine/sidechain';
import type { SequenceRhythm } from '../../shared/sequenceRhythm';
// Main-thread BL-1 engine: owns the AudioContext and the bass worklet.
//
// The master FX rack (drive, compressor, OTT, chorus, ping-pong delay, reverb, master gain, DC
// block, lookahead limiter) lives inside the worklet, ported from the plugin's
// BassFx — see audio-engine-review B5/W6. The native-node graph it replaces was
// a different algorithm from the plugin's on every stage. The only node left on
// this side is the scope analyser.

import { guardAudioNavigation } from '../../shared/audioNavigationGuard';
import { generateTables, type GeneratedTable } from '../../engine/wavetables';
import { type ParamValues } from '../../params';
import { defaultBassParams } from '../params';
import workletUrl from './worklet-bass.js?url';
import ottWorkletUrl from '../../engine/ott-worklet.js?url';
import type { DynamicsMessage } from '../../engine/dynamics';
import type { EchoMessage } from '../../engine/echo';
import type { ReverbMessage } from '../../engine/reverb';
import type { ArpConfig } from '../../seq/clipArp';

export interface VizTable {
  name: string;
  frames: number;
  viz: Float32Array;
}

export interface BassStepMessage {
  t: 'step';
  s: number;
  pat: number;
  semi: number; // -100 = rest
  acc: boolean;
  slide: boolean;
}

export interface BassVizMessage {
  t: 'viz';
  pos: number;
  env: number;
  fenv: number;
  cut: number;
  gate: boolean;
  semi: number; // -100 = idle
}

// Hosted-mode options (SQ-4): share an AudioContext and route the engine's
// output into a provided node instead of ctx.destination. Defaults keep the
// standalone behavior byte-for-byte. See docs/sq4-clips.md §7.
export interface EngineInitOpts {
  ctx?: AudioContext;
  output?: AudioNode;
}

export class BassEngine {
  setArp(config: { notes: number[]; hits: boolean[]; accents: boolean[]; slides?: boolean[]; rate: number; gate: number } | null): void {
    if (this.ready) this.node.port.postMessage({ t: 'arp', config });
  }
  private dynamicsListeners = new Set<(message: DynamicsMessage) => void>();
  private echoListeners = new Set<(message: EchoMessage) => void>();
  private reverbListeners = new Set<(message: ReverbMessage) => void>();

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
  ready: boolean;
  onstep: ((d: BassStepMessage) => void) | null;
  onviz: ((d: BassVizMessage) => void) | null;
  onclipstart: ((frame: number) => void) | null;
  onclipstop: ((frame: number) => void) | null;
  onpos: ((d: { step: number; bar: number }) => void) | null;
  output: AudioNode | null; // hosted-mode output (null = ctx.destination)

  ctx!: AudioContext;
  node!: AudioWorkletNode;

  scopeAnalyser!: AnalyserNode;

  constructor() {
    this.params = defaultBassParams();
    this.tables = null;
    this.builtInTables = [];
    this.ready = false;
    this.onstep = null;
    this.onviz = null;
    this.onclipstart = null;
    this.onclipstop = null;
    this.onpos = null;
    this.output = null;
  }

  async init(opts: EngineInitOpts = {}): Promise<void> {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = opts.ctx ?? new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.output = opts.output ?? null;
    await ctx.audioWorklet.addModule(ottWorkletUrl);
    await ctx.audioWorklet.addModule(workletUrl);

    this.builtInTables = generateTables();
    this.tables = this.builtInTables.map((t) => ({ name: t.name, frames: t.frames, viz: t.viz }));

    this.node = new AudioWorkletNode(ctx, 'fable-bl', {
      // Side-chain key bus (src/engine/sidechain.ts); unconnected when standalone.
      numberOfInputs: 1, channelCount: KEY_CHANNELS, channelCountMode: 'explicit', channelInterpretation: 'discrete',
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node.port.onmessage = (e: MessageEvent) => {
      if (e.data.t === 'step' && this.onstep) this.onstep(e.data as BassStepMessage);
      if (e.data.t === 'viz' && this.onviz) this.onviz(e.data as BassVizMessage);
      if (e.data.t === 'pos' && this.onpos) this.onpos({ step: e.data.step as number, bar: e.data.bar as number });
      if (e.data.t === 'clipstart' && this.onclipstart) this.onclipstart(e.data.frame as number);
      if (e.data.t === 'clipstop' && this.onclipstop) this.onclipstop(e.data.frame as number);
      if (e.data.t === 'dynamics') this.dynamicsListeners.forEach(listener => listener(e.data as DynamicsMessage));
      if (e.data.t === 'echo') this.echoListeners.forEach(listener => listener(e.data as EchoMessage));
      if (e.data.t === 'reverb') this.reverbListeners.forEach(listener => listener(e.data as ReverbMessage));
    };
    this.node.port.postMessage({ t: 'init', params: this.params });
    this.ready = true;
    guardAudioNavigation(ctx);
    if (this.dynamicsListeners.size) this.node.port.postMessage({ t: 'dynamics', on: true });
    if (this.echoListeners.size) this.node.port.postMessage({ t: 'echo', on: true });
    if (this.reverbListeners.size) this.node.port.postMessage({ t: 'reverb', on: true });
    this.pushTables();

    this.scopeAnalyser = ctx.createAnalyser();
    this.scopeAnalyser.fftSize = 2048;
    this.node.connect(this.scopeAnalyser);
    this.node.connect(this.output ?? ctx.destination);
  }

  // Reported latency of the worklet's FX chain, in samples: the 4x drive
  // oversampler's FIR group delay plus the limiter lookahead. Matches
  // BassFx::latencySamples() — 107 at 48 kHz.
  get latencySamples(): number {
    if (!this.ready) return 0;
    return 35 + Math.max(8, Math.round(0.0015 * this.ctx.sampleRate));
  }

  pushTables(): void {
    if (!this.ready) return;
    this.node.port.postMessage({
      t: 'tables',
      list: this.builtInTables.map((t) => ({ frames: t.frames, mips: t.mips, size: t.size, buf: t.data.slice().buffer })),
    });
  }

  // ---------- parameter + transport API ----------
  setParam(id: string, v: number): void {
    this.params[id] = v;
    if (this.ready) this.node.port.postMessage({ t: 'p', k: id, v });
  }

  applyAllParams(): void {
    if (this.ready) this.node.port.postMessage({ t: 'init', params: this.params });
  }

  noteOn(semi: number, vel: number): void {
    if (this.ready) this.node.port.postMessage({ t: 'noteon', semi, vel });
  }

  noteOff(semi: number): void {
    if (this.ready) this.node.port.postMessage({ t: 'noteoff', semi });
  }

  play(): void {
    if (this.ready) this.node.port.postMessage({ t: 'play' });
  }

  stop(): void {
    if (this.ready) this.node.port.postMessage({ t: 'stop' });
  }

  setPatterns(p: Uint8Array): void {
    if (this.ready) this.node.port.postMessage({ t: 'pats', data: p.slice().buffer });
  }

  setChain(c: number[]): void {
    if (this.ready) this.node.port.postMessage({ t: 'chain', list: c });
  }

  // Hosted preset changes reset sound while preserving active and queued clips.
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

  /** Standalone scale mode: the sequencer's scale map (src/scales.ts), or none. */
  setScale(map?: number[][]): void {
    if (this.ready) this.node.port.postMessage({ t: 'scale', map: map ?? null });
  }
  setSequenceRhythm(rhythm?: SequenceRhythm): void {
    if (this.ready) this.node.port.postMessage({ t: 'sequenceRhythm', rhythm: rhythm ?? null });
  }

  scheduleClip(data: Uint8Array, bars: number, atFrame: number, arp?: ArpConfig, sequenceRhythm?: SequenceRhythm, scale?: number[][]): void {
    if (this.ready) this.node.port.postMessage({ t: 'clip', data, bars, atFrame, arp, sequenceRhythm, scale });
  }

  scheduleStop(atFrame: number): void {
    if (this.ready) this.node.port.postMessage({ t: 'clipstop', atFrame });
  }

  /** Hosted clip automation: absolute-value tables per parameter (SQ-4). */
  setClipAutomation(lanes: { k: string; table: Float32Array; len: number; fit: number; rot: number }[]): void {
    if (this.ready) this.node.port.postMessage({ t: 'auto', lanes });
  }
  updateClip(data: Uint8Array, bars: number, arp?: ArpConfig, sequenceRhythm?: SequenceRhythm, scale?: number[][]): void {
    if (this.ready) this.node.port.postMessage({ t: 'clipupdate', data, bars, arp, sequenceRhythm, scale });
  }
}
