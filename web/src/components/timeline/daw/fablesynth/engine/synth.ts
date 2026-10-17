import { KEY_CHANNELS } from './sidechain';
import type { SequenceRhythm } from '../shared/sequenceRhythm';
// Main-thread engine: owns the AudioContext and the worklet node.
//
// The FX rack used to live here as a graph of native WebAudio nodes
// (WaveShaper / Delay / Convolver / DynamicsCompressor). It now runs inside the
// worklet, as a port of juce/source/dsp/Fx.cpp, so the web app and the plugin
// run one algorithm and the FX are testable offline (audio-engine review, W6).
// EVERY parameter therefore goes to the worklet; what is left on this thread is
// the scope and spectrum analysers, which tap the worklet's output.

import { guardAudioNavigation } from '../shared/audioNavigationGuard';
import { generateTables, type GeneratedTable } from './wavetables';
import { defaultParams, type ParamValues } from '../params';
// The DSP core runs in the audio render thread. `?url` makes Vite copy it
// verbatim and hand us the served URL for `audioWorklet.addModule`.
import workletUrl from './worklet.js?url';
import ottWorkletUrl from './ott-worklet.js?url';
import labWorkletUrl from './lab-worklet.js?url';
import type { DynamicsMessage } from './dynamics';
import type { EchoMessage } from './echo';
import type { ReverbMessage } from './reverb';
import type { ArpConfig } from '../seq/clipArp';

export interface VizMessage {
  t: 'viz';
  a: number;
  b: number;
  n: number;
}

// Live per-destination modulation sums for the UI's knob indicators:
// d[MOD_DESTS index] = the viz voice's summed route value x. null closes the
// stream (last voice died) so listeners settle back to base values.
export interface ModMessage {
  t: 'mod';
  d: Float32Array | null;
}

export interface StepMessage {
  t: 'step';
  s: number; // step index 0..15
  pat: number; // pattern being played
}

// Hosted-mode options (SQ-4): share an AudioContext and route the engine's
// output into a provided node instead of ctx.destination. Defaults keep the
// standalone behavior byte-for-byte. See docs/sq4-clips.md §7.
export interface EngineInitOpts {
  ctx?: AudioContext;
  output?: AudioNode;
}

export interface PosMessage {
  t: 'pos';
  step: number;
  bar: number;
}

export interface VizTable {
  name: string;
  frames: number;
  viz: Float32Array;
}

export class SynthEngine {
  private reverbListeners = new Set<(message: ReverbMessage) => void>();

  subscribeReverb(listener: (message: ReverbMessage) => void): () => void {
    this.reverbListeners.add(listener);
    if (this.ready && this.reverbListeners.size === 1) this.node.port.postMessage({ t: 'reverb', on: true });
    return () => {
      this.reverbListeners.delete(listener);
      if (this.ready && !this.reverbListeners.size) this.node.port.postMessage({ t: 'reverb', on: false });
    };
  }
  private echoListeners = new Set<(message: EchoMessage) => void>();

  subscribeEcho(listener: (message: EchoMessage) => void): () => void {
    this.echoListeners.add(listener);
    if (this.ready && this.echoListeners.size === 1) this.node.port.postMessage({ t: 'echo', on: true });
    return () => {
      this.echoListeners.delete(listener);
      if (this.ready && !this.echoListeners.size) this.node.port.postMessage({ t: 'echo', on: false });
    };
  }
  private dynamicsListeners = new Set<(message: DynamicsMessage) => void>();

  subscribeDynamics(listener: (message: DynamicsMessage) => void): () => void {
    this.dynamicsListeners.add(listener);
    if (this.ready && this.dynamicsListeners.size === 1) this.node.port.postMessage({ t: 'dynamics', on: true });
    return () => {
      this.dynamicsListeners.delete(listener);
      if (this.ready && !this.dynamicsListeners.size) this.node.port.postMessage({ t: 'dynamics', on: false });
    };
  }
  transportAnchor = -1;
  params: ParamValues;
  tables: VizTable[] | null; // combined [{name, frames, viz}] kept for visualization
  procTables: GeneratedTable[]; // procedural tables (full mip data)
  userTables: GeneratedTable[]; // imported / drawn tables (full mip data)
  // What the worklet currently holds, slot for slot — pushTables diffs
  // against it so an edit only re-sends the table that changed.
  pushedTables: GeneratedTable[];
  onviz: ((d: VizMessage) => void) | null;
  onmod: ((d: Float32Array | null) => void) | null;
  onstep: ((d: StepMessage) => void) | null;
  onclipstart: ((frame: number) => void) | null;
  onclipstop: ((frame: number) => void) | null;
  onpos: ((d: PosMessage) => void) | null;
  ready: boolean;
  output: AudioNode | null; // hosted-mode output (null = ctx.destination)
  // Latency of the worklet's FX chain, in samples: the 4x drive oversampler's
  // FIR group delay plus the limiter lookahead — 107 at 48 kHz. The worklet
  // reports it on init; Fx::latencySamples() in the plugin is the same number,
  // and BL-1/DR-1 expose the same property.
  latencySamples: number;

  ctx!: AudioContext;
  node!: AudioWorkletNode;

  scopeAnalyser!: AnalyserNode;
  specAnalyser!: AnalyserNode;

  constructor() {
    this.params = defaultParams();
    this.tables = null;
    this.procTables = [];
    this.userTables = [];
    this.pushedTables = [];
    this.onviz = null;
    this.onmod = null;
    this.onstep = null;
    this.onclipstart = null;
    this.onclipstop = null;
    this.onpos = null;
    this.ready = false;
    this.output = null;
    this.latencySamples = 0;
  }

  /** The same latency in seconds — audio leaves this engine that much after the
   *  worklet renders it. Callers aligning this engine against another device or
   *  against wall-clock time need it. */
  get latencySeconds(): number {
    return this.ready ? this.latencySamples / this.ctx.sampleRate : 0;
  }

  async init(opts: EngineInitOpts = {}): Promise<void> {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = opts.ctx ?? new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.output = opts.output ?? null;
    await ctx.audioWorklet.addModule(ottWorkletUrl);
    await ctx.audioWorklet.addModule(labWorkletUrl);
    await ctx.audioWorklet.addModule(workletUrl);

    this.procTables = generateTables();
    this.refreshViz();

    this.node = new AudioWorkletNode(ctx, 'fable-wt', {
      // Side-chain key bus (src/engine/sidechain.ts); unconnected when standalone.
      numberOfInputs: 1, channelCount: KEY_CHANNELS, channelCountMode: 'explicit', channelInterpretation: 'discrete',
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node.port.onmessage = (e: MessageEvent) => {
      if (e.data.t === 'viz' && this.onviz) this.onviz(e.data as VizMessage);
      else if (e.data.t === 'mod' && this.onmod) this.onmod((e.data as ModMessage).d);
      else if (e.data.t === 'anchor') this.transportAnchor = e.data.frame as number;
      else if (e.data.t === 'step' && this.onstep) this.onstep(e.data as StepMessage);
      else if (e.data.t === 'pos' && this.onpos) this.onpos(e.data as PosMessage);
      else if (e.data.t === 'clipstart' && this.onclipstart) this.onclipstart(e.data.frame as number);
      else if (e.data.t === 'clipstop' && this.onclipstop) this.onclipstop(e.data.frame as number);
      else if (e.data.t === 'latency') this.latencySamples = e.data.n as number;
      else if (e.data.t === 'dynamics') this.dynamicsListeners.forEach(listener => listener(e.data as DynamicsMessage));
      else if (e.data.t === 'echo') this.echoListeners.forEach(listener => listener(e.data as EchoMessage));
      else if (e.data.t === 'reverb') this.reverbListeners.forEach(listener => listener(e.data as ReverbMessage));
    };
    this.node.port.postMessage({ t: 'init', params: this.params });
    this.ready = true;
    guardAudioNavigation(ctx);
    if (this.dynamicsListeners.size) this.node.port.postMessage({ t: 'dynamics', on: true });
    if (this.echoListeners.size) this.node.port.postMessage({ t: 'echo', on: true });
    if (this.reverbListeners.size) this.node.port.postMessage({ t: 'reverb', on: true });
    this.pushTables();

    this.buildTaps();
  }

  // Combined table list (procedural first, then user) — the index space the
  // oscA/oscB.table params address.
  allTables(): GeneratedTable[] {
    return [...this.procTables, ...this.userTables];
  }

  // Rebuild the lightweight viz list used by the WavetableView displays.
  refreshViz(): void {
    this.tables = this.allTables().map((t) => ({ name: t.name, frames: t.frames, viz: t.viz }));
  }

  // Publish the mip data to the worklet, one slot at a time (finding W4).
  // The pool is 8.6 MB of factory tables plus up to MAX_USER_TABLES imports, so
  // a structured clone of the whole thing on every add/delete/rename stalled
  // the render thread and left the old buffers to a GC that runs there. Only
  // slots whose table actually changed are sent, and each slot's buffer is
  // TRANSFERRED — the one `slice()` is unavoidable because `t.data` is the
  // canonical copy the UI keeps drawing from.
  pushTables(): void {
    if (!this.ready) return;
    const all = this.allTables();
    const prev = this.pushedTables;
    if (all.length !== prev.length) this.node.port.postMessage({ t: 'tablecount', n: all.length });
    for (let i = 0; i < all.length; i++) {
      const t = all[i];
      if (prev[i] === t) continue;
      const buf = t.data.slice().buffer;
      this.node.port.postMessage({ t: 'table', i, frames: t.frames, mips: t.mips, size: t.size, buf }, [buf]);
    }
    this.pushedTables = all;
  }

  // Replace the user-table set and push it to the worklet + refresh viz.
  setUserTables(tables: GeneratedTable[]): void {
    this.userTables = tables;
    this.refreshViz();
    this.pushTables();
  }

  // ---------- output taps ----------
  // The signal is finished when it leaves the worklet, so the only nodes left
  // on this thread are the two analysers the scope and spectrum displays read.
  buildTaps(): void {
    const ctx = this.ctx;
    this.scopeAnalyser = ctx.createAnalyser();
    this.scopeAnalyser.fftSize = 2048;
    this.specAnalyser = ctx.createAnalyser();
    this.specAnalyser.fftSize = 2048;
    this.specAnalyser.smoothingTimeConstant = 0.82;
    this.node.connect(this.scopeAnalyser);
    this.node.connect(this.specAnalyser);
    this.node.connect(this.output ?? ctx.destination);
  }

  // ---------- param + note API ----------
  setParam(id: string, v: number): void {
    this.params[id] = v;
    if (!this.ready) return;
    // 'fx.*' and 'master.volume' are ordinary worklet params now — no special
    // case, and no reverb impulse to re-render (SIZE moves the Freeverb comb
    // feedback in place, so a sweep no longer cuts the tail).
    this.node.port.postMessage({ t: 'p', k: id, v });
  }

  applyAllParams(): void {
    if (!this.ready) return;
    this.node.port.postMessage({ t: 'init', params: this.params });
  }

  noteOn(n: number, vel = 1): void { if (this.ready) this.node.port.postMessage({ t: 'on', n, v: vel }); }
  noteOff(n: number): void { if (this.ready) this.node.port.postMessage({ t: 'off', n }); }
  bend(semis: number): void { if (this.ready) this.node.port.postMessage({ t: 'bend', s: semis }); }
  // Hosted preset changes reset sound while preserving active and queued clips.
  panic(preserveTransport = false): void { if (this.ready) this.node.port.postMessage({ t: 'panic', preserveTransport }); }

  // ---------- note sequencer ----------
  setSeqPatterns(pats: Uint8Array): void { if (this.ready) this.node.port.postMessage({ t: 'pats', data: pats }); }
  setSeqChain(list: number[]): void { if (this.ready) this.node.port.postMessage({ t: 'chain', list }); }
  seqPlay(): void { if (this.ready) this.node.port.postMessage({ t: 'play' }); }
  setArp(config: { notes: number[]; hits: boolean[]; accents: boolean[]; rate: number; gate: number } | null): void {
    if (this.ready) this.node.port.postMessage({ t: 'arp', config });
  }
  seqStop(): void {
    if (this.ready) this.node.port.postMessage({ t: 'stop' });
    this.transportAnchor = -1;
  }
  transportSteps(bpm: number): number | null {
    if (!this.ready || this.transportAnchor < 0) return null;
    return Math.max(0, (this.ctx.currentTime * this.ctx.sampleRate - this.transportAnchor)
      / ((this.ctx.sampleRate * 60) / Math.max(1, bpm) / 4));
  }
  setSequenceAutomation(lanes: { k: string; table: Float32Array; len: number; fit: number; rot: number }[]): void {
    if (this.ready) this.node.port.postMessage({ t: 'seqauto', lanes });
  }

  // ---------- hosted clip transport (SQ-4, docs/sq4-clips.md §6) ----------
  setHostMode(on: boolean): void { if (this.ready) this.node.port.postMessage({ t: 'host', on: on ? 1 : 0 }); }
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
  scheduleStop(atFrame: number): void { if (this.ready) this.node.port.postMessage({ t: 'clipstop', atFrame }); }
  /** Hosted clip automation: absolute-value tables per parameter (SQ-4). */
  setClipAutomation(lanes: { k: string; table: Float32Array; len: number; fit: number; rot: number }[]): void {
    if (this.ready) this.node.port.postMessage({ t: 'auto', lanes });
  }
  updateClip(data: Uint8Array, bars: number, arp?: ArpConfig, sequenceRhythm?: SequenceRhythm, scale?: number[][]): void { if (this.ready) this.node.port.postMessage({ t: 'clipupdate', data, bars, arp, sequenceRhythm, scale }); }
}
