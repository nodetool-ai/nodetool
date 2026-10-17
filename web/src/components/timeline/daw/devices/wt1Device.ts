/**
 * FableSynth WT-1 as a live timeline device: the `fable-wt` AudioWorklet with
 * its full FX rack, LFOs and mod matrix, driven by the timeline's note events.
 *
 * The wavetables, the parameter record and (for an offline render) the whole
 * score travel in `processorOptions`, and the factory waits for the
 * processor's `ready` reply, so the first rendered quantum already has them.
 */

import type { MidiInstrument, WavetableMidiInstrument } from "@nodetool-ai/timeline";

import type { DynamicsMessage } from "../fablesynth/engine/dynamics";
import type { EchoMessage } from "../fablesynth/engine/echo";
import type { ReverbMessage } from "../fablesynth/engine/reverb";
import { KEY_CHANNELS } from "../fablesynth/engine/sidechain";
import { loadUserTablePool } from "../fablesynth/engine/usertables";
import { factoryTables, type GeneratedTable } from "../fablesynth/engine/wavetables";
import type { ParamValues } from "../fablesynth/params";
import type { LiveDeviceFactory, LiveDeviceOptions } from "./liveDevice";
import { loadFableWorklets } from "./loadFableWorklets";
import { encodeLiveEvents, WorkletInstrumentDevice } from "./workletDevice";
import { wt1ParamsFromInstrument } from "./wt1Params";

/** Wavetable positions of the voice the displays follow, and the voice count. */
export interface Wt1VizMessage {
  a: number;
  b: number;
  n: number;
}

/** Live per-destination modulation sums, or null when the last voice ended. */
export type Wt1ModMessage = Float32Array | null;

const READY_TIMEOUT_MS = 5000;

type Listener<T> = (message: T) => void;

class Channel<T> {
  private readonly listeners = new Set<Listener<T>>();
  add(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  emit(message: T): void {
    this.listeners.forEach((listener) => listener(message));
  }
  get size(): number {
    return this.listeners.size;
  }
}

function tablePayload(table: GeneratedTable): {
  frames: number;
  mips: number;
  size: number;
  buf: ArrayBuffer;
} {
  return {
    frames: table.frames,
    mips: table.mips,
    size: table.size,
    buf: table.data.slice().buffer
  };
}

export class Wt1Device extends WorkletInstrumentDevice {
  readonly scopeAnalyser: AnalyserNode;
  readonly specAnalyser: AnalyserNode;
  /** FX chain latency (drive oversampler and limiter lookahead), in samples. */
  latencySamples = 0;
  private params: ParamValues;
  private tables: GeneratedTable[];
  private disposed = false;
  private readonly viz = new Channel<Wt1VizMessage>();
  private readonly mod = new Channel<Wt1ModMessage>();
  private readonly dynamics = new Channel<DynamicsMessage>();
  private readonly echo = new Channel<EchoMessage>();
  private readonly reverb = new Channel<ReverbMessage>();
  private readonly disposal = new Channel<void>();

  constructor(
    ctx: BaseAudioContext,
    node: AudioWorkletNode,
    output: GainNode,
    params: ParamValues,
    tables: GeneratedTable[]
  ) {
    super(ctx, node, output);
    this.params = params;
    this.tables = tables;
    this.scopeAnalyser = ctx.createAnalyser();
    this.scopeAnalyser.fftSize = 2048;
    this.specAnalyser = ctx.createAnalyser();
    this.specAnalyser.fftSize = 2048;
    this.specAnalyser.smoothingTimeConstant = 0.82;
    node.connect(output);
    node.connect(this.scopeAnalyser);
    node.connect(this.specAnalyser);
  }

  /** The context the device renders in. */
  get context(): BaseAudioContext {
    return this.ctx;
  }

  /** Every procedural and user table the worklet holds, in parameter index order. */
  get wavetables(): readonly GeneratedTable[] {
    return this.tables;
  }

  /** Route a worklet message to its listeners. */
  handleMessage(data: { t?: string } & Record<string, unknown>): void {
    switch (data.t) {
      case "viz":
        this.viz.emit(data as unknown as Wt1VizMessage);
        break;
      case "mod":
        this.mod.emit((data.d as Float32Array | null) ?? null);
        break;
      case "latency":
        this.latencySamples = Number(data.n) || 0;
        break;
      case "dynamics":
        this.dynamics.emit(data as unknown as DynamicsMessage);
        break;
      case "echo":
        this.echo.emit(data as unknown as EchoMessage);
        break;
      case "reverb":
        this.reverb.emit(data as unknown as ReverbMessage);
        break;
    }
  }

  setInstrument(instrument: MidiInstrument): void {
    if (instrument.type !== "wavetable") return;
    this.applyParams(wt1ParamsFromInstrument(instrument));
  }

  /** Send only the parameters that differ from what the worklet holds. */
  applyParams(next: ParamValues): void {
    for (const [id, v] of Object.entries(next)) {
      if (this.params[id] !== v) this.setParam(id, v);
    }
  }

  setParam(id: string, value: number): void {
    if (!Number.isFinite(value)) return;
    this.params[id] = value;
    this.node.port.postMessage({ t: "p", k: id, v: value });
  }

  getParams(): Readonly<ParamValues> {
    return this.params;
  }

  noteOn(pitch: number, velocity: number): void {
    this.node.port.postMessage({ t: "on", n: pitch, v: Math.min(1, Math.max(0, velocity / 127)) });
  }

  noteOff(pitch: number): void {
    this.node.port.postMessage({ t: "off", n: pitch });
  }

  /** Pitch bend in semitones. */
  bend(semitones: number): void {
    this.node.port.postMessage({ t: "bend", s: semitones });
  }

  /** Silence every voice and reset the FX tails. */
  panic(): void {
    this.node.port.postMessage({ t: "panic" });
  }

  /** Replace the user tables that follow the procedural ones. Only changed slots are sent. */
  setUserTables(userTables: readonly GeneratedTable[]): void {
    const next = [...factoryTables(), ...userTables];
    const prev = this.tables;
    if (next.length !== prev.length) {
      this.node.port.postMessage({ t: "tablecount", n: next.length });
    }
    next.forEach((table, i) => {
      if (prev[i] === table) return;
      const payload = tablePayload(table);
      this.node.port.postMessage({ t: "table", i, ...payload }, [payload.buf]);
    });
    this.tables = next;
  }

  onViz(listener: Listener<Wt1VizMessage>): () => void {
    return this.viz.add(listener);
  }

  onMod(listener: Listener<Wt1ModMessage>): () => void {
    return this.mod.add(listener);
  }

  onDispose(listener: () => void): () => void {
    return this.disposal.add(listener);
  }

  subscribeDynamics(listener: Listener<DynamicsMessage>): () => void {
    return this.metered("dynamics", this.dynamics, listener);
  }

  subscribeEcho(listener: Listener<EchoMessage>): () => void {
    return this.metered("echo", this.echo, listener);
  }

  subscribeReverb(listener: Listener<ReverbMessage>): () => void {
    return this.metered("reverb", this.reverb, listener);
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    super.dispose();
    this.scopeAnalyser.disconnect();
    this.specAnalyser.disconnect();
    this.disposal.emit();
  }

  // The worklet measures an FX stage only while something displays it.
  private metered<T>(kind: "dynamics" | "echo" | "reverb", channel: Channel<T>, listener: Listener<T>): () => void {
    const remove = channel.add(listener);
    if (channel.size === 1) this.node.port.postMessage({ t: kind, on: true });
    return () => {
      remove();
      if (channel.size === 0 && !this.disposed) this.node.port.postMessage({ t: kind, on: false });
    };
  }
}

/** Wait for the processor's `ready` reply (it has its tables, params and score). */
function processorReady(node: AudioWorkletNode, device: { handleMessage: Wt1Device["handleMessage"] } | null): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, READY_TIMEOUT_MS);
    node.port.onmessage = (event: MessageEvent) => {
      const data = event.data as { t?: string } & Record<string, unknown>;
      if (data?.t === "ready") {
        clearTimeout(timer);
        resolve();
      }
      device?.handleMessage(data);
    };
  });
}

export const createWt1Device: LiveDeviceFactory = async (
  ctx: BaseAudioContext,
  instrument: MidiInstrument,
  options?: LiveDeviceOptions
) => {
  if (instrument.type !== "wavetable") {
    throw new Error(`WT-1 cannot play a ${instrument.type} instrument`);
  }
  await loadFableWorklets(ctx, ["ott", "lab", "wt1"]);
  const params = wt1ParamsFromInstrument(instrument as WavetableMidiInstrument);
  const tables = [...factoryTables(), ...loadUserTablePool().map((u) => u.table)];
  const events = options?.events?.length
    ? encodeLiveEvents(options.events, ctx.sampleRate)
    : undefined;
  const node = new AudioWorkletNode(ctx, "fable-wt", {
    // The side-chain key bus; unconnected in the timeline.
    numberOfInputs: 1,
    channelCount: KEY_CHANNELS,
    channelCountMode: "explicit",
    channelInterpretation: "discrete",
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {
      params: { ...params },
      tables: tables.map(tablePayload),
      events
    }
  });
  const output = ctx.createGain();
  const device = new Wt1Device(ctx, node, output, params, tables);
  await processorReady(node, device);
  return device;
};
