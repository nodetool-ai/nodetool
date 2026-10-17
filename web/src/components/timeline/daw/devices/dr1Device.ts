/**
 * FableSynth DR-1 as a live timeline device: the drum worklet (`fable-dr`)
 * with its pad voices, per-pad FX, group strip and five buses, summed to one
 * stereo output. A note at `baseNote + i` plays pad `i`.
 */

import type { DrumMidiInstrument, MidiInstrument } from "@nodetool-ai/timeline";

import type { DynamicsMessage } from "../fablesynth/engine/dynamics";
import type { EchoMessage } from "../fablesynth/engine/echo";
import type { ReverbMessage } from "../fablesynth/engine/reverb";
import type { ParamValues } from "../fablesynth/params";
import { OUT_NAMES, pad, PAD_COUNT } from "../fablesynth/drum/params";
import { loadDrumAssets, workletAssetLists } from "../fablesynth/drum/engine/drumAssets";
import type { LiveDeviceFactory, LiveDeviceOptions } from "./liveDevice";
import { loadFableWorklets } from "./loadFableWorklets";
import { encodeLiveEvents, WorkletInstrumentDevice } from "./workletDevice";
import { dr1ParamsFromInstrument } from "./dr1Params";

export interface Dr1VizMessage {
  t: "viz";
  /** Wavetable position the selected pad plays now, or -1 when silent. */
  a: number;
  /** Sample playhead of the selected pad, 0..1, or -1. */
  b: number;
  env: number;
}

/** One block of a pad's post-FX mono signal, for the kit auto-mix. */
export interface Dr1PadAudioMessage {
  t: "padAudio";
  pad: number;
  frames: number;
  data: Float32Array;
}

type Listener<T> = (message: T) => void;

class Topic<T> {
  readonly listeners = new Set<Listener<T>>();
  emit(message: T): void {
    for (const listener of this.listeners) listener(message);
  }
}

function asDrum(instrument: MidiInstrument): DrumMidiInstrument {
  if (instrument.type !== "drum") throw new Error(`DR-1 cannot play a ${instrument.type} instrument`);
  return instrument;
}

export class Dr1Device extends WorkletInstrumentDevice {
  private bpm = 120;
  private applied: ParamValues;
  private baseNote: number;
  private lastInstrument: DrumMidiInstrument;
  private meterPad = 0;
  private readonly dynamics = new Topic<DynamicsMessage>();
  private readonly echo = new Topic<EchoMessage>();
  private readonly reverb = new Topic<ReverbMessage>();
  private readonly padAudio = new Topic<Dr1PadAudioMessage>();
  private readonly viz = new Topic<Dr1VizMessage>();
  private readonly hits = new Topic<number[]>();

  constructor(
    ctx: BaseAudioContext,
    node: AudioWorkletNode,
    output: AudioNode,
    instrument: DrumMidiInstrument,
    params: ParamValues
  ) {
    super(ctx, node, output);
    this.applied = { ...params };
    this.baseNote = instrument.baseNote;
    this.lastInstrument = instrument;
    node.port.onmessage = (event: MessageEvent) => this.onMessage(event.data);
  }

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  /** The record the worklet plays now. */
  get params(): Readonly<ParamValues> {
    return this.applied;
  }

  setInstrument(instrument: MidiInstrument): void {
    const drum = asDrum(instrument);
    if (drum === this.lastInstrument) return;
    this.lastInstrument = drum;
    if (drum.baseNote !== this.baseNote) {
      this.baseNote = drum.baseNote;
      this.node.port.postMessage({ t: "base", note: drum.baseNote });
    }
    const next = { ...dr1ParamsFromInstrument(drum), "seq.bpm": this.bpm };
    for (const [id, value] of Object.entries(next)) {
      if (this.applied[id] !== value) this.setParam(id, value);
    }
  }

  /** Synced LFOs and LAB divisions read `seq.bpm`; the document tempo owns it. */
  setTempo(bpm: number): void {
    this.bpm = bpm;
    this.setParam("seq.bpm", bpm);
  }

  /** Send one param now, ahead of the document write that follows it. */
  setParam(id: string, value: number): void {
    if (!Number.isFinite(value)) return;
    this.applied[id] = value;
    this.node.port.postMessage({ t: "p", k: id, v: value });
  }

  /** Hit a pad directly (pad grid clicks, browser auditions). Velocity 0..1. */
  triggerPad(padIndex: number, velocity: number): void {
    if (padIndex < 0 || padIndex >= PAD_COUNT) return;
    // A click is the user gesture a suspended context waits for.
    if (this.ctx instanceof AudioContext && this.ctx.state === "suspended") void this.ctx.resume();
    this.node.port.postMessage({ t: "trig", pad: padIndex, v: velocity });
    this.hits.emit([padIndex]);
  }

  noteOn(pitch: number, velocity: number): void {
    this.triggerPad(pitch - this.baseNote, Math.max(0, Math.min(1, velocity / 127)));
  }

  noteOff(): void {
    // Pads are one-shots: a note-off releases nothing.
  }

  /** The pad whose voice, FX meters and visualizer the worklet reports. */
  selectPad(padIndex: number): void {
    this.meterPad = Math.max(0, Math.min(PAD_COUNT - 1, padIndex | 0));
    this.node.port.postMessage({ t: "sel", pad: this.meterPad });
    this.node.port.postMessage({ t: "meterPad", pad: this.meterPad });
  }

  private subscribe<T>(topic: Topic<T>, flag: string | null, listener: Listener<T>): () => void {
    topic.listeners.add(listener);
    if (flag && topic.listeners.size === 1) this.node.port.postMessage({ t: flag, on: true });
    return () => {
      topic.listeners.delete(listener);
      if (flag && topic.listeners.size === 0) this.node.port.postMessage({ t: flag, on: false });
    };
  }

  subscribeDynamics(listener: Listener<DynamicsMessage>): () => void {
    return this.subscribe(this.dynamics, "dynamics", listener);
  }
  subscribeEcho(listener: Listener<EchoMessage>): () => void {
    return this.subscribe(this.echo, "echo", listener);
  }
  subscribeReverb(listener: Listener<ReverbMessage>): () => void {
    return this.subscribe(this.reverb, "reverb", listener);
  }
  subscribePadAudio(listener: Listener<Dr1PadAudioMessage>): () => void {
    return this.subscribe(this.padAudio, "padCapture", listener);
  }
  subscribeViz(listener: Listener<Dr1VizMessage>): () => void {
    return this.subscribe(this.viz, null, listener);
  }
  /** Pads hit by the timeline's events or by `triggerPad`. */
  subscribeHits(listener: Listener<number[]>): () => void {
    return this.subscribe(this.hits, null, listener);
  }

  private onMessage(data: { t?: string; pad?: number; bus?: number; pads?: number[] }): void {
    const forPad = data.pad === undefined || data.pad === this.meterPad;
    switch (data.t) {
      case "hits":
        if (Array.isArray(data.pads)) this.hits.emit(data.pads);
        break;
      case "viz":
        this.viz.emit(data as Dr1VizMessage);
        break;
      case "padAudio":
        this.padAudio.emit(data as Dr1PadAudioMessage);
        break;
      case "dynamics":
        if (forPad) this.dynamics.emit(data as DynamicsMessage);
        break;
      case "echo":
        if (forPad) this.echo.emit(data as EchoMessage);
        break;
      case "reverb": {
        const bus = Math.max(0, Math.min(OUT_NAMES.length - 1, this.applied[pad(this.meterPad, "out")] | 0));
        if (forPad && (data.bus === undefined || data.bus === bus)) this.reverb.emit(data as ReverbMessage);
        break;
      }
    }
  }

  dispose(): void {
    for (const topic of [this.dynamics, this.echo, this.reverb, this.padAudio, this.viz, this.hits]) {
      topic.listeners.clear();
    }
    super.dispose();
  }
}

export async function createDr1DeviceInstance(
  ctx: BaseAudioContext,
  instrument: MidiInstrument,
  options: LiveDeviceOptions = {}
): Promise<Dr1Device> {
  const drum = asDrum(instrument);
  const [assets] = await Promise.all([
    loadDrumAssets(),
    loadFableWorklets(ctx, ["ott", "lab", "dr1"])
  ]);
  const params = dr1ParamsFromInstrument(drum);
  const lists = workletAssetLists(assets);
  const processorOptions: Record<string, unknown> = {
    mixdown: true,
    baseNote: drum.baseNote,
    params,
    tables: lists.tables,
    samples: lists.samples
  };
  if (options.events?.length) {
    processorOptions.events = encodeLiveEvents(options.events, ctx.sampleRate);
  }
  const node = new AudioWorkletNode(ctx, "fable-dr", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions
  });
  const output = ctx.createGain();
  node.connect(output);
  return new Dr1Device(ctx, node, output, drum, params);
}

export const createDr1Device: LiveDeviceFactory = (ctx, instrument, options) =>
  createDr1DeviceInstance(ctx, instrument, options);
