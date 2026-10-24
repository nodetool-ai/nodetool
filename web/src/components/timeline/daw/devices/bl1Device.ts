/**
 * FableSynth BL-1 as a live timeline device: the `fable-bl` AudioWorklet
 * (mono acid voice and FX rack) fed by the timeline's note events.
 *
 * The processor receives everything it needs to render through
 * `processorOptions` (the param record, the wavetables and, offline, the
 * whole score), so an `OfflineAudioContext` render never waits on a message.
 */

import type { MidiInstrument } from "@nodetool-ai/timeline";

import type { DynamicsMessage } from "../fablesynth/engine/dynamics";
import type { EchoMessage } from "../fablesynth/engine/echo";
import type { ReverbMessage } from "../fablesynth/engine/reverb";
import type { ParamValues } from "../fablesynth/params";
import { bl1ParamRecord, changedBl1Params } from "./bl1Params";
import { bl1ProcessorTables } from "./bl1Tables";
import type { LiveDeviceFactory } from "./liveDevice";
import { loadFableWorklets } from "./loadFableWorklets";
import { encodeLiveEvents, WorkletInstrumentDevice } from "./workletDevice";

/** What the processor reports about its voice, about 23 times a second. */
export interface Bl1Viz {
  /** Smoothed wavetable position, or -1 when the voice is idle. */
  pos: number;
  env: number;
  fenv: number;
  /** Swept cutoff in Hz, or -1 when idle. */
  cut: number;
  gate: boolean;
  /** The sounding MIDI pitch, or -1 when idle. */
  pitch: number;
}

type Listener<T> = (message: T) => void;

/** The FX panels' telemetry surface (`FxTelemetryEngine`). */
export interface Bl1Telemetry {
  ctx: { sampleRate: number };
  subscribeDynamics(listener: Listener<DynamicsMessage>): () => void;
  subscribeEcho(listener: Listener<EchoMessage>): () => void;
  subscribeReverb(listener: Listener<ReverbMessage>): () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function bassOf(instrument: MidiInstrument): ParamValues | null {
  return instrument.type === "bass" ? bl1ParamRecord(instrument) : null;
}

export class Bl1Device extends WorkletInstrumentDevice {
  readonly telemetry: Bl1Telemetry;
  private params: ParamValues;
  private lastInstrument: MidiInstrument | null = null;
  private analyser: AnalyserNode | null = null;
  private readonly vizListeners = new Set<Listener<Bl1Viz>>();
  private readonly dynamics = new Set<Listener<DynamicsMessage>>();
  private readonly echo = new Set<Listener<EchoMessage>>();
  private readonly reverb = new Set<Listener<ReverbMessage>>();

  constructor(ctx: BaseAudioContext, node: AudioWorkletNode, params: ParamValues) {
    super(ctx, node, node);
    this.params = params;
    node.port.onmessage = (event: MessageEvent) => this.onMessage(event.data);
    this.telemetry = {
      ctx: { sampleRate: ctx.sampleRate },
      subscribeDynamics: (listener) => this.subscribe(this.dynamics, "dynamics", listener),
      subscribeEcho: (listener) => this.subscribe(this.echo, "echo", listener),
      subscribeReverb: (listener) => this.subscribe(this.reverb, "reverb", listener)
    };
  }

  /** The param record the processor is playing. */
  get currentParams(): Readonly<ParamValues> {
    return this.params;
  }

  setInstrument(instrument: MidiInstrument): void {
    if (instrument === this.lastInstrument) return;
    this.lastInstrument = instrument;
    const next = bassOf(instrument);
    if (!next) return;
    const changed = changedBl1Params(this.params, next);
    this.params = next;
    for (const k of changed) this.node.port.postMessage({ t: "p", k, v: next[k] });
  }

  noteOn(pitch: number, velocity: number): void {
    const vel = Math.min(1, Math.max(0, velocity / 127));
    this.node.port.postMessage({ t: "noteon", pitch, vel });
  }

  noteOff(pitch: number): void {
    this.node.port.postMessage({ t: "noteoff", pitch });
  }

  /** Tempo for the bar-locked LFO, and the context time of beat zero. */
  setTempo(bpm: number, beatZeroSec = 0): void {
    this.node.port.postMessage({
      t: "tempo",
      bpm,
      anchor: Math.round(beatZeroSec * this.ctx.sampleRate)
    });
  }

  /** A scope tap on the device output, created on first use. */
  getAnalyser(): AnalyserNode {
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.node.connect(this.analyser);
    }
    return this.analyser;
  }

  subscribeViz(listener: Listener<Bl1Viz>): () => void {
    this.vizListeners.add(listener);
    return () => {
      this.vizListeners.delete(listener);
    };
  }

  override dispose(): void {
    this.vizListeners.clear();
    this.dynamics.clear();
    this.echo.clear();
    this.reverb.clear();
    this.analyser?.disconnect();
    super.dispose();
  }

  private subscribe<T>(set: Set<Listener<T>>, kind: string, listener: Listener<T>): () => void {
    set.add(listener);
    if (set.size === 1) this.node.port.postMessage({ t: kind, on: true });
    return () => {
      set.delete(listener);
      if (set.size === 0) this.node.port.postMessage({ t: kind, on: false });
    };
  }

  private onMessage(data: unknown): void {
    if (!isRecord(data)) return;
    switch (data.t) {
      case "viz": {
        const viz: Bl1Viz = {
          pos: Number(data.pos),
          env: Number(data.env),
          fenv: Number(data.fenv),
          cut: Number(data.cut),
          gate: data.gate === true,
          pitch: Number(data.pitch)
        };
        this.vizListeners.forEach((listener) => listener(viz));
        break;
      }
      case "dynamics":
        this.dynamics.forEach((listener) => listener(data as unknown as DynamicsMessage));
        break;
      case "echo":
        this.echo.forEach((listener) => listener(data as unknown as EchoMessage));
        break;
      case "reverb":
        this.reverb.forEach((listener) => listener(data as unknown as ReverbMessage));
        break;
    }
  }
}

export const createBl1Device: LiveDeviceFactory = async (ctx, instrument, options) => {
  if (instrument.type !== "bass") {
    throw new Error(`BL-1 cannot play a ${instrument.type} instrument`);
  }
  await loadFableWorklets(ctx, ["pauto", "ott", "bl1"]);
  const params = bl1ParamRecord(instrument);
  const node = new AudioWorkletNode(ctx, "fable-bl", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {
      params,
      tables: bl1ProcessorTables(),
      events: options?.events ? encodeLiveEvents(options.events, ctx.sampleRate) : undefined
    }
  });
  const device = new Bl1Device(ctx, node, params);
  device.setInstrument(instrument);
  return device;
};
