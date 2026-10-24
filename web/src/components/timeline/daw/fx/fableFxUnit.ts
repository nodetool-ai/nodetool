/**
 * The Web Audio side of a `fable` track effect: a `fable-fx` AudioWorkletNode
 * between two pass-through gains. The effect chain is built synchronously, so
 * when the processor module is not on the context yet the gains pass the dry
 * signal and the worklet is spliced in once the module loads, with the
 * effect's latest params. An offline export calls `preloadFableFx` first and
 * then gets the worklet at build time.
 */

import type {
  TimelineMasterChannel,
  TimelineTrack,
  TrackFableEffect
} from "@nodetool-ai/timeline";

import type { DynamicsMessage } from "../fablesynth/engine/dynamics";
import type { EchoMessage } from "../fablesynth/engine/echo";
import type { ReverbMessage } from "../fablesynth/engine/reverb";
import type { FxTelemetryEngine } from "../fablesynth/components/panels/fxAdapter";
import type { DeviceAutomationLane } from "../devices/liveDevice";
import { loadFableWorklets } from "../devices/loadFableWorklets";
import { postAutomation, syncAutomation } from "../devices/workletDevice";
import { resolvedFableFxParams } from "./fableFxParams";

export const FABLE_FX_PROCESSOR = "fable-fx";

const ready = new WeakSet<BaseAudioContext>();
const pending = new WeakMap<BaseAudioContext, Promise<void>>();

/** Load the processor (after the `ott` and `lab` globals it builds on). */
export function preloadFableFx(ctx: BaseAudioContext): Promise<void> {
  let promise = pending.get(ctx);
  if (!promise) {
    promise = loadFableWorklets(ctx, ["pauto", "ott", "lab", "fx"]).then(() => {
      ready.add(ctx);
    });
    pending.set(ctx, promise);
  }
  return promise;
}

export function isFableFxReady(ctx: BaseAudioContext): boolean {
  return ready.has(ctx);
}

/** True when any track or the master carries an enabled `fable` effect. */
export function usesFableFx(
  tracks: readonly TimelineTrack[],
  master?: TimelineMasterChannel
): boolean {
  const effects = [
    ...tracks.flatMap((track) => track.effects ?? []),
    ...(master?.effects ?? [])
  ];
  return effects.some((effect) => effect.type === "fable" && effect.enabled);
}

type Telemetry = "dynamics" | "echo" | "reverb";
type TelemetryMessage = DynamicsMessage | EchoMessage | ReverbMessage;

/**
 * One running `fable` effect. It is the panels' telemetry engine: listeners
 * subscribe before or after the worklet exists, and the processor only
 * meters while someone listens.
 */
export class FableFxHandle implements FxTelemetryEngine {
  node: AudioWorkletNode | null = null;
  disposed = false;
  private readonly listeners: Record<Telemetry, Set<(message: TelemetryMessage) => void>> = {
    dynamics: new Set(),
    echo: new Set(),
    reverb: new Set()
  };

  constructor(
    readonly ctx: BaseAudioContext,
    public effect: TrackFableEffect,
    public bpm: number
  ) {}

  /** Lanes sent before the worklet existed, posted when it attaches. */
  private automation: readonly DeviceAutomationLane[] = [];

  /** Replace the automation lanes this stage plays (FableSynth param ids). */
  setAutomation(lanes: readonly DeviceAutomationLane[]): void {
    this.automation = lanes;
    if (this.node) postAutomation(this.node.port, lanes, this.ctx.sampleRate);
  }

  /** Resolves once the worklet holds every lane sent before. */
  syncAutomation(): Promise<void> {
    return this.node ? syncAutomation(this.node.port) : Promise.resolve();
  }

  attach(node: AudioWorkletNode): void {
    this.node = node;
    if (this.automation.length > 0) postAutomation(node.port, this.automation, this.ctx.sampleRate);
    node.port.onmessage = (event: MessageEvent<TelemetryMessage>) => {
      const message = event.data;
      if (!message || typeof message !== "object") return;
      const set = this.listeners[message.t as Telemetry];
      set?.forEach((listener) => listener(message));
    };
    for (const kind of Object.keys(this.listeners) as Telemetry[]) {
      if (this.listeners[kind].size > 0) node.port.postMessage({ t: kind, on: true });
    }
  }

  update(effect: TrackFableEffect, bpm: number): void {
    this.effect = effect;
    this.bpm = bpm;
    this.node?.port.postMessage({
      t: "params",
      params: resolvedFableFxParams(effect),
      enabled: effect.enabled,
      bpm
    });
  }

  private subscribe(kind: Telemetry, listener: (message: TelemetryMessage) => void): () => void {
    const set = this.listeners[kind];
    set.add(listener);
    if (set.size === 1) this.node?.port.postMessage({ t: kind, on: true });
    return () => {
      set.delete(listener);
      if (set.size === 0) this.node?.port.postMessage({ t: kind, on: false });
    };
  }

  subscribeDynamics(listener: (message: DynamicsMessage) => void): () => void {
    return this.subscribe("dynamics", listener as (message: TelemetryMessage) => void);
  }

  subscribeEcho(listener: (message: EchoMessage) => void): () => void {
    return this.subscribe("echo", listener as (message: TelemetryMessage) => void);
  }

  subscribeReverb(listener: (message: ReverbMessage) => void): () => void {
    return this.subscribe("reverb", listener as (message: TelemetryMessage) => void);
  }
}

export interface FableFxNodes {
  input: GainNode;
  output: GainNode;
  /** Every node the unit owns; the worklet joins once it exists. */
  nodes: AudioNode[];
  handle: FableFxHandle;
}

function createWorklet(handle: FableFxHandle): AudioWorkletNode {
  const { effect } = handle;
  return new AudioWorkletNode(handle.ctx, FABLE_FX_PROCESSOR, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: "explicit",
    channelInterpretation: "speakers",
    processorOptions: {
      kind: effect.kind,
      params: resolvedFableFxParams(effect),
      enabled: effect.enabled,
      bpm: handle.bpm
    }
  });
}

function splice(unit: FableFxNodes): void {
  const node = createWorklet(unit.handle);
  unit.handle.attach(node);
  unit.nodes.push(node);
  try {
    unit.input.disconnect(unit.output);
  } catch {
    /* not connected */
  }
  unit.input.connect(node).connect(unit.output);
}

/** Build the nodes for a `fable` effect. */
export function buildFableFxNodes(
  ctx: BaseAudioContext,
  effect: TrackFableEffect,
  bpm: number
): FableFxNodes {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const handle = new FableFxHandle(ctx, effect, bpm);
  const unit: FableFxNodes = { input, output, nodes: [input, output], handle };
  if (isFableFxReady(ctx)) {
    splice(unit);
    return unit;
  }
  input.connect(output);
  preloadFableFx(ctx).then(
    () => {
      if (!handle.disposed) splice(unit);
    },
    (error: unknown) => {
      console.error("[fable-fx] processor failed to load; passing the signal dry", error);
    }
  );
  return unit;
}

/** Stop a unit's worklet from being spliced in after its chain was torn down. */
export function disposeFableFxNodes(unit: FableFxNodes): void {
  unit.handle.disposed = true;
  unit.handle.node?.port.close();
}
