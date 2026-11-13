import { loadKernels, type Kernels } from "@nodetool-ai/kernels";
import type { AudioRef } from "@nodetool-ai/protocol";
import type {
  ProcessingContext,
  StreamingInputs,
  StreamingOutputs
} from "@nodetool-ai/runtime";
import {
  audioRefFromWav,
  decodeAudioToWav,
  encodeWav,
  requireAudioBytes
} from "./audio-wav.js";
import { makeDoneSignalChunk, makeSignalChunk, readSignalChunk } from "./cv.js";
import { AUDIO_SAMPLE_RATE, AUDIO_BLOCK_FRAMES } from "@nodetool-ai/protocol";

export interface SignalEffect<Node> {
  readonly kernel: string;
  readonly create: (
    node: Node,
    kernels: Kernels,
    channels: number,
    rate: number
  ) => Float64Array;
  readonly process: (
    node: Node,
    kernels: Kernels,
    state: Float64Array,
    samples: Float32Array,
    channels: number,
    rate: number
  ) => Float32Array;
  readonly structural?: (node: Node) => number;
  readonly tail?: (node: Node, rate: number) => number;
  readonly clip?: (
    node: Node,
    kernels: Kernels,
    samples: Float32Array,
    channels: number,
    rate: number
  ) => Float32Array;
}

export async function applyToClip<Node>(
  effect: SignalEffect<Node>,
  node: Node,
  audio: Record<string, unknown>,
  context?: ProcessingContext
): Promise<AudioRef> {
  const wav = await decodeAudioToWav(await requireAudioBytes(audio, context));
  const kernels = await loadKernels();
  const samples = effect.clip
    ? effect.clip(node, kernels, wav.samples, wav.numChannels, wav.sampleRate)
    : effect.process(
        node,
        kernels,
        effect.create(node, kernels, wav.numChannels, wav.sampleRate),
        wav.samples,
        wav.numChannels,
        wav.sampleRate
      );
  return audioRefFromWav(encodeWav(samples, wav.sampleRate, wav.numChannels));
}

export async function applyToSignal<Node>(
  effect: SignalEffect<Node>,
  node: Node,
  inputs: StreamingInputs,
  outputs: StreamingOutputs
): Promise<void> {
  const kernels = await loadKernels();
  let state: Float64Array | undefined;
  let rate = AUDIO_SAMPLE_RATE;
  let channels = 1;
  let structural: number | undefined;
  for await (const item of inputs.stream("chunk")) {
    const chunk = readSignalChunk(item);
    if (!chunk) {
      continue;
    }
    if (chunk.done) {
      break;
    }
    if (chunk.samples.length === 0) {
      continue;
    }
    const nextStructural = effect.structural?.(node);
    if (
      !state ||
      channels !== chunk.channels ||
      rate !== chunk.sampleRate ||
      structural !== nextStructural
    ) {
      channels = chunk.channels;
      rate = chunk.sampleRate;
      structural = nextStructural;
      state = effect.create(node, kernels, channels, rate);
    }
    const samples = effect.process(
      node,
      kernels,
      state,
      chunk.samples,
      channels,
      rate
    );
    await outputs.emit(
      "chunk",
      makeSignalChunk(samples, rate, channels, false, "pcm16le")
    );
  }
  if (state && !inputs.signal.aborted) {
    if (effect.structural?.(node) !== structural) {
      structural = effect.structural?.(node);
      state = effect.create(node, kernels, channels, rate);
    }
    let remaining = effect.tail?.(node, rate) ?? 0;
    while (remaining > 0 && !inputs.signal.aborted) {
      const frames = Math.min(AUDIO_BLOCK_FRAMES, remaining);
      const nextStructural = effect.structural?.(node);
      if (nextStructural !== structural) {
        structural = nextStructural;
        state = effect.create(node, kernels, channels, rate);
      }
      const samples = effect.process(
        node,
        kernels,
        state,
        new Float32Array(frames * channels),
        channels,
        rate
      );
      await outputs.emit(
        "chunk",
        makeSignalChunk(samples, rate, channels, false, "pcm16le")
      );
      remaining -= frames;
    }
  }
  await outputs.emit("chunk", makeDoneSignalChunk(rate, channels, "pcm16le"));
}
