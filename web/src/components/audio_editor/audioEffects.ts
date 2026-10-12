/**
 * The audio editor's effect catalogue.
 *
 * Each effect declares its parameters (for the effect dialog) and a `process`
 * function that turns a segment into its processed output. Filters, reverb,
 * echo, chorus, and speed run through a Web Audio graph rendered in an
 * `OfflineAudioContext`, so they use the browser's own biquad, convolution,
 * delay-line, and resampling code. Dynamics and waveshaping effects run in
 * `effectsDsp.ts`, where timing is sample-exact.
 *
 * `applyEffect` processes a range of a sample and writes the result back,
 * mixing any reverb or echo tail onto the audio that follows the range.
 */

import {
  makeAudioSample,
  numChannels,
  numFrames,
  overlayFrames,
  resolveRange,
  sampleToAudioBuffer,
  audioBufferToSample,
  sliceFrames,
  spliceFrames,
  type AudioSample
} from "./audioSample";
import {
  bitcrush,
  compress,
  dbToGain,
  distort,
  invert,
  limit,
  noiseGate,
  removeDcOffset,
  tremolo
} from "./effectsDsp";

export type EffectParams = Record<string, number>;

export interface EffectParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit: "dB" | "Hz" | "ms" | "s" | "%" | "×" | ":1" | "bits" | "";
}

export type EffectGroup = "Tone" | "Dynamics" | "Space" | "Character" | "Time";

export interface AudioEffect {
  id: string;
  label: string;
  group: EffectGroup;
  description: string;
  /** Empty for effects that apply in one click without a dialog. */
  params: EffectParamSpec[];
  /**
   * Output length can differ from the input (speed). The processed audio then
   * replaces the range instead of being written over it.
   */
  changesLength?: boolean;
  process: (input: AudioSample, params: EffectParams) => Promise<AudioSample>;
}

// ---------------------------------------------------------------------------
// Offline Web Audio rendering
// ---------------------------------------------------------------------------

type OfflineCtor = typeof OfflineAudioContext;

const getOfflineContextCtor = (): OfflineCtor => {
  if (typeof window !== "undefined") {
    if (window.OfflineAudioContext) {
      return window.OfflineAudioContext;
    }
    if ("webkitOfflineAudioContext" in window) {
      return window.webkitOfflineAudioContext as OfflineCtor;
    }
  }
  throw new Error("Offline Web Audio rendering is not available");
};

/** Build the effect graph between `source` and the returned output node. */
type GraphBuilder = (ctx: BaseAudioContext, source: AudioNode) => AudioNode;

interface RenderOptions {
  /** Seconds of output after the input ends, for reverb and echo tails. */
  tailSeconds?: number;
  playbackRate?: number;
}

/** Play `input` through a Web Audio graph and capture the result. */
export const renderGraph = async (
  input: AudioSample,
  build: GraphBuilder,
  { tailSeconds = 0, playbackRate = 1 }: RenderOptions = {}
): Promise<AudioSample> => {
  const Ctor = getOfflineContextCtor();
  const frames = Math.max(
    1,
    Math.ceil(numFrames(input) / playbackRate) +
      Math.round(tailSeconds * input.sampleRate)
  );
  const ctx = new Ctor(numChannels(input), frames, input.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = sampleToAudioBuffer(input, ctx);
  source.playbackRate.value = playbackRate;
  build(ctx, source).connect(ctx.destination);
  source.start(0);
  return audioBufferToSample(await ctx.startRendering());
};

const gainNode = (ctx: BaseAudioContext, gain: number): GainNode => {
  const node = ctx.createGain();
  node.gain.value = gain;
  return node;
};

/** Sum `source` (dry) with `wetOut` at the given mix (0..1). */
const mixDryWet = (
  ctx: BaseAudioContext,
  source: AudioNode,
  wetOut: AudioNode,
  mix: number
): AudioNode => {
  const out = ctx.createGain();
  source.connect(gainNode(ctx, 1 - mix)).connect(out);
  wetOut.connect(gainNode(ctx, mix)).connect(out);
  return out;
};

const biquad = (
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  frequency: number,
  gainDb = 0,
  q = Math.SQRT1_2
): BiquadFilterNode => {
  const node = ctx.createBiquadFilter();
  node.type = type;
  // Keep the corner below Nyquist for low sample-rate clips.
  node.frequency.value = Math.min(frequency, ctx.sampleRate * 0.45);
  node.gain.value = gainDb;
  node.Q.value = q;
  return node;
};

/** Connect nodes in series and return the last one. */
const chain = (source: AudioNode, nodes: AudioNode[]): AudioNode =>
  nodes.reduce<AudioNode>((prev, node) => prev.connect(node), source);

/** Deterministic PRNG so the same reverb settings always render the same. */
const mulberry32 = (seed: number): (() => number) => {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Synthetic room impulse: exponentially decaying noise that falls 60 dB over
 * `decaySeconds`, decorrelated per channel for stereo width.
 */
export const createImpulseResponse = (
  ctx: BaseAudioContext,
  decaySeconds: number,
  channels: number
): AudioBuffer => {
  const length = Math.max(1, Math.round(decaySeconds * ctx.sampleRate));
  const buffer = ctx.createBuffer(Math.max(2, channels), length, ctx.sampleRate);
  // ln(1000) ≈ 6.91: amplitude reaches -60 dB at the end of the buffer.
  const k = Math.log(1000) / length;
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const random = mulberry32(c + 1);
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i += 1) {
      data[i] = (random() * 2 - 1) * Math.exp(-k * i);
    }
  }
  return buffer;
};

/** Seconds until a feedback echo falls below -60 dB, capped at 20 s. */
export const echoTailSeconds = (delaySec: number, feedback: number): number => {
  if (feedback <= 0.001) {
    return delaySec;
  }
  const repeats = Math.log(0.001) / Math.log(feedback);
  return Math.min(20, delaySec * (repeats + 1));
};

const pct = (value: number): number => value / 100;

const sync = (fn: (s: AudioSample) => AudioSample) => (s: AudioSample) =>
  Promise.resolve(fn(s));

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

const MIX: EffectParamSpec = {
  key: "mix",
  label: "Mix",
  min: 0,
  max: 100,
  step: 1,
  defaultValue: 35,
  unit: "%"
};

const EQ_BANDS: Array<{
  key: string;
  label: string;
  type: BiquadFilterType;
  frequency: number;
}> = [
  { key: "low", label: "Low (80 Hz)", type: "lowshelf", frequency: 80 },
  { key: "lowMid", label: "Low mid (250 Hz)", type: "peaking", frequency: 250 },
  { key: "mid", label: "Mid (1 kHz)", type: "peaking", frequency: 1000 },
  { key: "highMid", label: "High mid (4 kHz)", type: "peaking", frequency: 4000 },
  { key: "high", label: "High (12 kHz)", type: "highshelf", frequency: 12000 }
];

export const AUDIO_EFFECTS: AudioEffect[] = [
  {
    id: "equalizer",
    label: "Equalizer",
    group: "Tone",
    description: "Boost or cut five frequency bands.",
    params: EQ_BANDS.map((band) => ({
      key: band.key,
      label: band.label,
      min: -18,
      max: 18,
      step: 0.5,
      defaultValue: 0,
      unit: "dB"
    })),
    process: (input, p) =>
      renderGraph(input, (ctx, source) =>
        chain(
          source,
          EQ_BANDS.map((band) =>
            biquad(ctx, band.type, band.frequency, p[band.key], 1)
          )
        )
      )
  },
  {
    id: "lowCut",
    label: "Low cut",
    group: "Tone",
    description: "Remove rumble and hum below a frequency (high-pass filter).",
    params: [
      {
        key: "frequency",
        label: "Frequency",
        min: 20,
        max: 1000,
        step: 1,
        defaultValue: 100,
        unit: "Hz"
      }
    ],
    process: (input, p) =>
      renderGraph(input, (ctx, source) =>
        chain(source, [
          biquad(ctx, "highpass", p.frequency),
          biquad(ctx, "highpass", p.frequency)
        ])
      )
  },
  {
    id: "highCut",
    label: "High cut",
    group: "Tone",
    description: "Remove hiss and harshness above a frequency (low-pass filter).",
    params: [
      {
        key: "frequency",
        label: "Frequency",
        min: 500,
        max: 20000,
        step: 10,
        defaultValue: 8000,
        unit: "Hz"
      }
    ],
    process: (input, p) =>
      renderGraph(input, (ctx, source) =>
        chain(source, [
          biquad(ctx, "lowpass", p.frequency),
          biquad(ctx, "lowpass", p.frequency)
        ])
      )
  },
  {
    id: "compressor",
    label: "Compressor",
    group: "Dynamics",
    description: "Even out loud and quiet parts.",
    params: [
      { key: "thresholdDb", label: "Threshold", min: -60, max: 0, step: 0.5, defaultValue: -18, unit: "dB" },
      { key: "ratio", label: "Ratio", min: 1, max: 20, step: 0.1, defaultValue: 4, unit: ":1" },
      { key: "kneeDb", label: "Knee", min: 0, max: 24, step: 0.5, defaultValue: 6, unit: "dB" },
      { key: "attackMs", label: "Attack", min: 0, max: 200, step: 0.5, defaultValue: 5, unit: "ms" },
      { key: "releaseMs", label: "Release", min: 10, max: 2000, step: 10, defaultValue: 150, unit: "ms" },
      { key: "makeupDb", label: "Makeup gain", min: 0, max: 24, step: 0.5, defaultValue: 0, unit: "dB" }
    ],
    process: (input, p) =>
      Promise.resolve(
        compress(input, {
          thresholdDb: p.thresholdDb,
          ratio: p.ratio,
          kneeDb: p.kneeDb,
          attackMs: p.attackMs,
          releaseMs: p.releaseMs,
          makeupDb: p.makeupDb
        })
      )
  },
  {
    id: "limiter",
    label: "Limiter",
    group: "Dynamics",
    description: "Stop peaks from going above a ceiling without clipping.",
    params: [
      { key: "inputDb", label: "Input gain", min: 0, max: 24, step: 0.5, defaultValue: 0, unit: "dB" },
      { key: "ceilingDb", label: "Ceiling", min: -24, max: 0, step: 0.1, defaultValue: -1, unit: "dB" },
      { key: "releaseMs", label: "Release", min: 1, max: 1000, step: 1, defaultValue: 80, unit: "ms" }
    ],
    process: (input, p) => {
      const gain = dbToGain(p.inputDb);
      const boosted = makeAudioSample(
        input.sampleRate,
        input.channels.map((channel) => channel.map((v) => v * gain))
      );
      return Promise.resolve(
        limit(boosted, {
          ceilingDb: p.ceilingDb,
          lookaheadMs: 5,
          releaseMs: p.releaseMs
        })
      );
    }
  },
  {
    id: "noiseGate",
    label: "Noise gate",
    group: "Dynamics",
    description: "Turn down background noise in the gaps between sounds.",
    params: [
      { key: "thresholdDb", label: "Threshold", min: -80, max: 0, step: 0.5, defaultValue: -40, unit: "dB" },
      { key: "reductionDb", label: "Reduction", min: -80, max: 0, step: 1, defaultValue: -60, unit: "dB" },
      { key: "attackMs", label: "Attack", min: 0, max: 100, step: 0.5, defaultValue: 2, unit: "ms" },
      { key: "holdMs", label: "Hold", min: 0, max: 500, step: 5, defaultValue: 50, unit: "ms" },
      { key: "releaseMs", label: "Release", min: 5, max: 1000, step: 5, defaultValue: 100, unit: "ms" }
    ],
    process: (input, p) =>
      Promise.resolve(
        noiseGate(input, {
          thresholdDb: p.thresholdDb,
          reductionDb: p.reductionDb,
          attackMs: p.attackMs,
          holdMs: p.holdMs,
          releaseMs: p.releaseMs
        })
      )
  },
  {
    id: "reverb",
    label: "Reverb",
    group: "Space",
    description: "Place the sound in a room. The tail rings past the selection.",
    params: [
      { key: "decay", label: "Decay", min: 0.2, max: 8, step: 0.1, defaultValue: 2, unit: "s" },
      { key: "preDelayMs", label: "Pre-delay", min: 0, max: 200, step: 1, defaultValue: 20, unit: "ms" },
      { key: "tone", label: "Tone", min: 1000, max: 20000, step: 100, defaultValue: 8000, unit: "Hz" },
      MIX
    ],
    process: (input, p) =>
      renderGraph(
        input,
        (ctx, source) => {
          const preDelay = ctx.createDelay(1);
          preDelay.delayTime.value = p.preDelayMs / 1000;
          const convolver = ctx.createConvolver();
          convolver.buffer = createImpulseResponse(
            ctx,
            p.decay,
            numChannels(input)
          );
          const wet = chain(source, [
            preDelay,
            convolver,
            biquad(ctx, "lowpass", p.tone)
          ]);
          return mixDryWet(ctx, source, wet, pct(p.mix));
        },
        { tailSeconds: p.decay + p.preDelayMs / 1000 }
      )
  },
  {
    id: "echo",
    label: "Echo",
    group: "Space",
    description: "Repeat the sound with fading copies. Echoes ring past the selection.",
    params: [
      { key: "delayMs", label: "Delay", min: 20, max: 2000, step: 5, defaultValue: 350, unit: "ms" },
      { key: "feedback", label: "Feedback", min: 0, max: 90, step: 1, defaultValue: 40, unit: "%" },
      MIX
    ],
    process: (input, p) =>
      renderGraph(
        input,
        (ctx, source) => {
          const delay = ctx.createDelay(2.5);
          delay.delayTime.value = p.delayMs / 1000;
          source.connect(delay);
          delay.connect(gainNode(ctx, pct(p.feedback))).connect(delay);
          return mixDryWet(ctx, source, delay, pct(p.mix));
        },
        { tailSeconds: echoTailSeconds(p.delayMs / 1000, pct(p.feedback)) }
      )
  },
  {
    id: "chorus",
    label: "Chorus",
    group: "Space",
    description: "Thicken the sound with a slowly moving copy of itself.",
    params: [
      { key: "rateHz", label: "Rate", min: 0.1, max: 8, step: 0.1, defaultValue: 1.2, unit: "Hz" },
      { key: "depthMs", label: "Depth", min: 0.5, max: 10, step: 0.1, defaultValue: 3, unit: "ms" },
      { key: "delayMs", label: "Delay", min: 5, max: 40, step: 0.5, defaultValue: 15, unit: "ms" },
      { ...MIX, defaultValue: 50 }
    ],
    process: (input, p) =>
      renderGraph(input, (ctx, source) => {
        const delay = ctx.createDelay(0.1);
        delay.delayTime.value = p.delayMs / 1000;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = p.rateHz;
        lfo.connect(gainNode(ctx, p.depthMs / 2000)).connect(delay.delayTime);
        lfo.start(0);
        source.connect(delay);
        return mixDryWet(ctx, source, delay, pct(p.mix));
      })
  },
  {
    id: "distortion",
    label: "Distortion",
    group: "Character",
    description: "Saturate and clip the signal for grit and warmth.",
    params: [
      { key: "driveDb", label: "Drive", min: 0, max: 40, step: 0.5, defaultValue: 12, unit: "dB" },
      { key: "outputDb", label: "Output", min: -24, max: 6, step: 0.5, defaultValue: -3, unit: "dB" },
      { ...MIX, defaultValue: 100 }
    ],
    process: (input, p) =>
      Promise.resolve(
        distort(input, {
          driveDb: p.driveDb,
          outputDb: p.outputDb,
          mix: pct(p.mix)
        })
      )
  },
  {
    id: "bitcrusher",
    label: "Bitcrusher",
    group: "Character",
    description: "Lo-fi digital grit from fewer bits and a lower sample rate.",
    params: [
      { key: "bits", label: "Bit depth", min: 1, max: 16, step: 1, defaultValue: 8, unit: "bits" },
      { key: "downsample", label: "Downsample", min: 1, max: 32, step: 1, defaultValue: 4, unit: "×" },
      { ...MIX, defaultValue: 100 }
    ],
    process: (input, p) =>
      Promise.resolve(
        bitcrush(input, {
          bits: p.bits,
          downsample: p.downsample,
          mix: pct(p.mix)
        })
      )
  },
  {
    id: "tremolo",
    label: "Tremolo",
    group: "Character",
    description: "Pulse the volume up and down.",
    params: [
      { key: "rateHz", label: "Rate", min: 0.5, max: 20, step: 0.1, defaultValue: 5, unit: "Hz" },
      { key: "depth", label: "Depth", min: 0, max: 100, step: 1, defaultValue: 60, unit: "%" }
    ],
    process: (input, p) =>
      Promise.resolve(tremolo(input, { rateHz: p.rateHz, depth: pct(p.depth) }))
  },
  {
    id: "speed",
    label: "Change speed",
    group: "Time",
    description: "Speed up or slow down. Pitch moves with speed, like tape.",
    params: [
      { key: "rate", label: "Speed", min: 0.25, max: 4, step: 0.01, defaultValue: 1.25, unit: "×" }
    ],
    changesLength: true,
    process: (input, p) =>
      renderGraph(input, (_ctx, source) => source, { playbackRate: p.rate })
  },
  {
    id: "invert",
    label: "Invert",
    group: "Character",
    description: "Flip the waveform's polarity.",
    params: [],
    process: sync(invert)
  },
  {
    id: "removeDc",
    label: "Remove DC offset",
    group: "Tone",
    description: "Centre a waveform that sits above or below zero.",
    params: [],
    process: sync(removeDcOffset)
  }
];

export const EFFECT_GROUPS: EffectGroup[] = [
  "Tone",
  "Dynamics",
  "Space",
  "Character",
  "Time"
];

export const getAudioEffect = (id: string): AudioEffect | undefined =>
  AUDIO_EFFECTS.find((effect) => effect.id === id);

export const defaultEffectParams = (effect: AudioEffect): EffectParams =>
  Object.fromEntries(effect.params.map((p) => [p.key, p.defaultValue]));

/**
 * Process the range (or the whole sample) with an effect and write the result
 * back. Returns the input unchanged when the range is empty.
 */
export const applyEffect = async (
  sample: AudioSample,
  effect: AudioEffect,
  params: EffectParams,
  startSec?: number,
  endSec?: number
): Promise<AudioSample> => {
  const range = resolveRange(sample, startSec, endSec);
  if (!range) {
    return sample;
  }
  const processed = await effect.process(sliceFrames(sample, range), params);
  return effect.changesLength
    ? spliceFrames(sample, range, processed)
    : overlayFrames(sample, range, processed);
};

/** Longest stretch of audio the effect dialog renders for a preview. */
export const PREVIEW_MAX_SECONDS = 15;

/**
 * Process the start of the range (at most `PREVIEW_MAX_SECONDS`) for an
 * audition, including any tail. Returns null when the range is empty.
 */
export const renderEffectPreview = async (
  sample: AudioSample,
  effect: AudioEffect,
  params: EffectParams,
  startSec?: number,
  endSec?: number
): Promise<AudioSample | null> => {
  const range = resolveRange(sample, startSec, endSec);
  if (!range) {
    return null;
  }
  const end = Math.min(
    range.end,
    range.start + Math.round(PREVIEW_MAX_SECONDS * sample.sampleRate)
  );
  return effect.process(sliceFrames(sample, { start: range.start, end }), params);
};
