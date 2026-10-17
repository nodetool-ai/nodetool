/**
 * Web Audio nodes for the timeline's audio effects: the DSP chain of a track
 * and the real-time chain of a clip. `AudioGraph` builds both from here, so
 * the preview and the browser export hear one implementation. The ffmpeg
 * steps in `packages/video-nodes/src/nodes/timeline.ts` mirror it for the
 * server render.
 */
import { clipAudioTailSec } from "@nodetool-ai/timeline";
import type {
  ClipAudioEffect,
  ClipDistortionEffect,
  ClipEchoEffect,
  ClipReverbEffect,
  TrackCompressorEffect,
  TrackEffect,
  TrackEq3Effect,
  TrackFableEffect,
  TrackFilterEffect,
  TrackGainEffect
} from "@nodetool-ai/timeline";

import { createImpulseResponse } from "../../audio_editor/audioEffects";
import {
  buildFableFxNodes,
  disposeFableFxNodes,
  type FableFxHandle
} from "../daw/fx/fableFxUnit";

/** An effect a track chain or a clip chain can hold. */
export type AudioEffect = TrackEffect | ClipAudioEffect;

/**
 * One effect's audio nodes, wired `input → ...internal... → output` so a
 * chain can connect units in series.
 */
export interface EffectUnit {
  effect: AudioEffect;
  input: AudioNode;
  output: AudioNode;
  /** All allocated nodes, disconnected on rebuild or release. */
  nodes: AudioNode[];
  /** The running FableSynth stage of a `fable` effect. */
  fable?: FableFxHandle;
}

/** Context a unit needs beyond its effect. */
export interface EffectUnitOptions {
  /** Tempo for tempo-synced `fable` echo and LAB stages. Default 120. */
  bpm?: number;
}

/** Send a `fable` effect's new params to its running unit, without a rebuild. */
export function applyFableEffect(
  unit: EffectUnit,
  e: TrackFableEffect,
  bpm: number
): void {
  unit.fable?.update(e, bpm);
}

/** Disconnect a unit's nodes and stop a pending `fable` worklet from attaching. */
export function releaseEffectUnit(unit: EffectUnit): void {
  if (unit.fable) {
    disposeFableFxNodes({
      input: unit.input as GainNode,
      output: unit.output as GainNode,
      nodes: unit.nodes,
      handle: unit.fable
    });
  }
  disconnectNodes(unit.nodes);
}

const dbToLin = (db: number): number => Math.pow(10, db / 20);

export function applyGainEffect(node: GainNode, e: TrackGainEffect): void {
  node.gain.value = dbToLin(e.gainDb);
}

export function applyEq3Effect(
  low: BiquadFilterNode,
  mid: BiquadFilterNode,
  high: BiquadFilterNode,
  e: TrackEq3Effect
): void {
  low.frequency.value = e.lowFreq;
  low.gain.value = e.lowGainDb;
  mid.frequency.value = e.midFreq;
  mid.Q.value = e.midQ;
  mid.gain.value = e.midGainDb;
  high.frequency.value = e.highFreq;
  high.gain.value = e.highGainDb;
}

export function applyFilterEffect(
  node: BiquadFilterNode,
  e: TrackFilterEffect
): void {
  node.type = e.mode;
  node.frequency.value = e.frequency;
  node.Q.value = e.q;
}

export function applyCompressorEffect(
  node: DynamicsCompressorNode,
  e: TrackCompressorEffect
): void {
  node.threshold.value = e.thresholdDb;
  node.ratio.value = e.ratio;
  node.attack.value = e.attackMs / 1000;
  node.release.value = e.releaseMs / 1000;
  node.knee.value = e.kneeDb;
}

const DISTORTION_CURVE_POINTS = 4096;

/** `tanh(k·x) / tanh(k)`: soft clipping that keeps full scale at full scale. */
export function distortionCurve(driveDb: number): Float32Array<ArrayBuffer> {
  const k = dbToLin(Math.max(0, driveDb));
  const norm = Math.tanh(k);
  const curve = new Float32Array(DISTORTION_CURVE_POINTS);
  for (let i = 0; i < DISTORTION_CURVE_POINTS; i += 1) {
    const x = (i / (DISTORTION_CURVE_POINTS - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

/** Wet/dry mixer around `wetIn → … → wetOut`; returns the unit. */
function dryWetUnit(
  ctx: BaseAudioContext,
  effect: AudioEffect,
  wetIn: AudioNode,
  wetOut: AudioNode,
  mix: number,
  inner: AudioNode[]
): EffectUnit {
  const input = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const output = ctx.createGain();
  const m = Math.min(1, Math.max(0, mix));
  dry.gain.value = 1 - m;
  wet.gain.value = m;
  input.connect(dry).connect(output);
  input.connect(wetIn);
  wetOut.connect(wet).connect(output);
  return { effect, input, output, nodes: [input, dry, wet, output, ...inner] };
}

function buildEcho(ctx: BaseAudioContext, e: ClipEchoEffect): EffectUnit {
  const delay = ctx.createDelay(5);
  delay.delayTime.value = Math.max(0.001, e.delayMs / 1000);
  const feedback = ctx.createGain();
  feedback.gain.value = Math.min(0.95, Math.max(0, e.feedback));
  delay.connect(feedback).connect(delay);
  return dryWetUnit(ctx, e, delay, delay, e.mix, [delay, feedback]);
}

function buildReverb(ctx: BaseAudioContext, e: ClipReverbEffect): EffectUnit {
  const convolver = ctx.createConvolver();
  convolver.buffer = createImpulseResponse(ctx, Math.max(0.05, e.decaySec), 2);
  return dryWetUnit(ctx, e, convolver, convolver, e.mix, [convolver]);
}

function buildDistortion(
  ctx: BaseAudioContext,
  e: ClipDistortionEffect
): EffectUnit {
  const shaper = ctx.createWaveShaper();
  shaper.curve = distortionCurve(e.driveDb);
  shaper.oversample = "2x";
  const output = ctx.createGain();
  output.gain.value = dbToLin(e.outputDb);
  shaper.connect(output);
  return { effect: e, input: shaper, output, nodes: [shaper, output] };
}

/** The nodes for one audio effect, or null for a video-only type. */
export function buildEffectUnit(
  ctx: BaseAudioContext,
  effect: AudioEffect,
  options: EffectUnitOptions = {}
): EffectUnit | null {
  switch (effect.type) {
    case "gain": {
      const node = ctx.createGain();
      applyGainEffect(node, effect);
      return { effect, input: node, output: node, nodes: [node] };
    }
    case "eq3": {
      const low = ctx.createBiquadFilter();
      low.type = "lowshelf";
      const mid = ctx.createBiquadFilter();
      mid.type = "peaking";
      const high = ctx.createBiquadFilter();
      high.type = "highshelf";
      applyEq3Effect(low, mid, high, effect);
      low.connect(mid);
      mid.connect(high);
      return { effect, input: low, output: high, nodes: [low, mid, high] };
    }
    case "filter": {
      const node = ctx.createBiquadFilter();
      applyFilterEffect(node, effect);
      return { effect, input: node, output: node, nodes: [node] };
    }
    case "compressor": {
      const node = ctx.createDynamicsCompressor();
      applyCompressorEffect(node, effect);
      return { effect, input: node, output: node, nodes: [node] };
    }
    case "echo":
      return buildEcho(ctx, effect);
    case "reverb":
      return buildReverb(ctx, effect);
    case "distortion":
      return buildDistortion(ctx, effect);
    case "fable": {
      const unit = buildFableFxNodes(ctx, effect, options.bpm ?? 120);
      return {
        effect,
        input: unit.input,
        output: unit.output,
        nodes: unit.nodes,
        fable: unit.handle
      };
    }
    default:
      return null;
  }
}

/**
 * A clip's real-time effects in series, ending in a gain the graph ramps to
 * silence when playback stops mid-tail.
 */
export interface ClipEffectChain {
  input: AudioNode;
  output: GainNode;
  nodes: AudioNode[];
  /** Seconds the chain rings after the clip's sound stops. */
  tailSec: number;
}

/** Build a clip's effect chain, or null when it has no enabled effect. */
export function buildClipEffectChain(
  ctx: BaseAudioContext,
  effects: readonly ClipAudioEffect[] | undefined
): ClipEffectChain | null {
  const units = (effects ?? [])
    .filter((effect) => effect.enabled)
    .map((effect) => buildEffectUnit(ctx, effect))
    .filter((unit): unit is EffectUnit => unit !== null);
  if (units.length === 0) {
    return null;
  }
  const output = ctx.createGain();
  for (let i = 0; i < units.length - 1; i += 1) {
    units[i].output.connect(units[i + 1].input);
  }
  units[units.length - 1].output.connect(output);
  return {
    input: units[0].input,
    output,
    nodes: [...units.flatMap((unit) => unit.nodes), output],
    tailSec: clipAudioTailSec(effects)
  };
}

/** Disconnect every node of a chain; already-disconnected nodes are fine. */
export function disconnectNodes(nodes: Iterable<AudioNode>): void {
  for (const node of nodes) {
    try {
      node.disconnect();
    } catch {
      /* not connected */
    }
  }
}
