import { MAX_STREAM_DELAY_SECONDS } from "@nodetool-ai/kernels";
import { prop } from "@nodetool-ai/node-sdk";
import type { Chunk } from "@nodetool-ai/protocol";
import type { StreamingInputs, StreamingOutputs } from "@nodetool-ai/runtime";
import { CHUNK_PROP_DEFAULT } from "../lib/cv.js";
import { applyToSignal } from "../lib/signal-effect.js";
import { BitcrushProperties } from "../lib/effect-properties.js";
import { BitcrushEffect } from "../lib/effect-descriptors.js";
export class StreamingBitcrushNode extends BitcrushProperties {
  static readonly nodeType = "nodetool.audio.realtime.StreamingBitcrush";
  static readonly title = "Streaming Bitcrush";
  static readonly description =
    "Processes audio chunks with persistent bitcrush state. Properties apply at the next block.";
  static readonly metadataOutputTypes = { chunk: "chunk" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["chunk"];
  static readonly isStreamingInput = true;
  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "Chunk",
    description: "Audio signal to process."
  })
  declare chunk: Chunk;
  async process(): Promise<Record<string, unknown>> {
    return {};
  }
  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    await applyToSignal(BitcrushEffect, this, inputs, outputs);
  }
}
import { CompressProperties } from "../lib/effect-properties.js";
import { CompressEffect } from "../lib/effect-descriptors.js";
export class StreamingCompressNode extends CompressProperties {
  static readonly nodeType = "nodetool.audio.realtime.StreamingCompress";
  static readonly title = "Streaming Compress";
  static readonly description =
    "Processes audio chunks with persistent compress state. Properties apply at the next block.";
  static readonly metadataOutputTypes = { chunk: "chunk" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["chunk"];
  static readonly isStreamingInput = true;
  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "Chunk",
    description: "Audio signal to process."
  })
  declare chunk: Chunk;
  async process(): Promise<Record<string, unknown>> {
    return {};
  }
  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    await applyToSignal(CompressEffect, this, inputs, outputs);
  }
}
import { DistortionProperties } from "../lib/effect-properties.js";
import { DistortionEffect } from "../lib/effect-descriptors.js";
export class StreamingDistortionNode extends DistortionProperties {
  static readonly nodeType = "nodetool.audio.realtime.StreamingDistortion";
  static readonly title = "Streaming Distortion";
  static readonly description =
    "Applies distortion to each audio chunk. Properties apply at the next block.";
  static readonly metadataOutputTypes = { chunk: "chunk" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["chunk"];
  static readonly isStreamingInput = true;
  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "Chunk",
    description: "Audio signal to process."
  })
  declare chunk: Chunk;
  async process(): Promise<Record<string, unknown>> {
    return {};
  }
  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    await applyToSignal(DistortionEffect, this, inputs, outputs);
  }
}
import { LimiterProperties } from "../lib/effect-properties.js";
import { LimiterEffect } from "../lib/effect-descriptors.js";
export class StreamingLimiterNode extends LimiterProperties {
  static readonly nodeType = "nodetool.audio.realtime.StreamingLimiter";
  static readonly title = "Streaming Limiter";
  static readonly description =
    "Processes audio chunks with persistent limiter state. Properties apply at the next block.";
  static readonly metadataOutputTypes = { chunk: "chunk" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["chunk"];
  static readonly isStreamingInput = true;
  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "Chunk",
    description: "Audio signal to process."
  })
  declare chunk: Chunk;
  async process(): Promise<Record<string, unknown>> {
    return {};
  }
  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    await applyToSignal(LimiterEffect, this, inputs, outputs);
  }
}
import { ReverbProperties } from "../lib/effect-properties.js";
import { ReverbEffect } from "../lib/effect-descriptors.js";
export class StreamingReverbNode extends ReverbProperties {
  static readonly nodeType = "nodetool.audio.realtime.StreamingReverb";
  static readonly title = "Streaming Reverb";
  static readonly description =
    "Processes audio chunks with persistent reverb state. Properties apply at the next block.";
  static readonly metadataOutputTypes = { chunk: "chunk" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["chunk"];
  static readonly isStreamingInput = true;
  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "Chunk",
    description: "Audio signal to process."
  })
  declare chunk: Chunk;
  async process(): Promise<Record<string, unknown>> {
    return {};
  }
  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    await applyToSignal(ReverbEffect, this, inputs, outputs);
  }
}
import { NoiseGateProperties } from "../lib/effect-properties.js";
import { NoiseGateEffect } from "../lib/effect-descriptors.js";
export class StreamingNoiseGateNode extends NoiseGateProperties {
  static readonly nodeType = "nodetool.audio.realtime.StreamingNoiseGate";
  static readonly title = "Streaming Noise Gate";
  static readonly description =
    "Processes audio chunks with persistent noisegate state. Properties apply at the next block.";
  static readonly metadataOutputTypes = { chunk: "chunk" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["chunk"];
  static readonly isStreamingInput = true;
  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "Chunk",
    description: "Audio signal to process."
  })
  declare chunk: Chunk;
  async process(): Promise<Record<string, unknown>> {
    return {};
  }
  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    await applyToSignal(NoiseGateEffect, this, inputs, outputs);
  }
}
import { PhaserProperties } from "../lib/effect-properties.js";
import { PhaserEffect } from "../lib/effect-descriptors.js";
export class StreamingPhaserNode extends PhaserProperties {
  static readonly nodeType = "nodetool.audio.realtime.StreamingPhaser";
  static readonly title = "Streaming Phaser";
  static readonly description =
    "Processes audio chunks with persistent phaser state. Properties apply at the next block.";
  static readonly metadataOutputTypes = { chunk: "chunk" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["chunk"];
  static readonly isStreamingInput = true;
  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "Chunk",
    description: "Audio signal to process."
  })
  declare chunk: Chunk;
  async process(): Promise<Record<string, unknown>> {
    return {};
  }
  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    await applyToSignal(PhaserEffect, this, inputs, outputs);
  }
}
import { DelayProperties } from "../lib/effect-properties.js";
import { DelayEffect } from "../lib/effect-descriptors.js";
export class StreamingDelayNode extends DelayProperties {
  static readonly nodeType = "nodetool.audio.realtime.StreamingDelay";
  static readonly title = "Streaming Delay";
  static readonly description =
    "Processes audio chunks with persistent delay state. Properties apply at the next block.";
  static readonly metadataOutputTypes = { chunk: "chunk" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["chunk"];
  static readonly isStreamingInput = true;
  static getDeclaredProperties(): ReturnType<
    typeof DelayProperties.getDeclaredProperties
  > {
    return super
      .getDeclaredProperties()
      .map((property) =>
        property.name === "delay_seconds"
          ? {
              ...property,
              options: { ...property.options, max: MAX_STREAM_DELAY_SECONDS }
            }
          : property
      );
  }
  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "Chunk",
    description: "Audio signal to process."
  })
  declare chunk: Chunk;
  async process(): Promise<Record<string, unknown>> {
    return {};
  }
  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    await applyToSignal(DelayEffect, this, inputs, outputs);
  }
}
import { HighShelfFilterProperties } from "../lib/effect-properties.js";
import { HighShelfFilterEffect } from "../lib/effect-descriptors.js";
export class StreamingHighShelfFilterNode extends HighShelfFilterProperties {
  static readonly nodeType = "nodetool.audio.realtime.StreamingHighShelf";
  static readonly title = "Streaming High Shelf";
  static readonly description =
    "Processes audio chunks with persistent highshelffilter state. Properties apply at the next block.";
  static readonly metadataOutputTypes = { chunk: "chunk" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["chunk"];
  static readonly isStreamingInput = true;
  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "Chunk",
    description: "Audio signal to process."
  })
  declare chunk: Chunk;
  async process(): Promise<Record<string, unknown>> {
    return {};
  }
  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    await applyToSignal(HighShelfFilterEffect, this, inputs, outputs);
  }
}
import { LowShelfFilterProperties } from "../lib/effect-properties.js";
import { LowShelfFilterEffect } from "../lib/effect-descriptors.js";
export class StreamingLowShelfFilterNode extends LowShelfFilterProperties {
  static readonly nodeType = "nodetool.audio.realtime.StreamingLowShelf";
  static readonly title = "Streaming Low Shelf";
  static readonly description =
    "Processes audio chunks with persistent lowshelffilter state. Properties apply at the next block.";
  static readonly metadataOutputTypes = { chunk: "chunk" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["chunk"];
  static readonly isStreamingInput = true;
  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "Chunk",
    description: "Audio signal to process."
  })
  declare chunk: Chunk;
  async process(): Promise<Record<string, unknown>> {
    return {};
  }
  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    await applyToSignal(LowShelfFilterEffect, this, inputs, outputs);
  }
}
import { PeakFilterProperties } from "../lib/effect-properties.js";
import { PeakFilterEffect } from "../lib/effect-descriptors.js";
export class StreamingPeakFilterNode extends PeakFilterProperties {
  static readonly nodeType = "nodetool.audio.realtime.StreamingPeak";
  static readonly title = "Streaming Peak";
  static readonly description =
    "Processes audio chunks with persistent peakfilter state. Properties apply at the next block.";
  static readonly metadataOutputTypes = { chunk: "chunk" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["chunk"];
  static readonly isStreamingInput = true;
  @prop({
    type: "chunk",
    default: CHUNK_PROP_DEFAULT,
    title: "Chunk",
    description: "Audio signal to process."
  })
  declare chunk: Chunk;
  async process(): Promise<Record<string, unknown>> {
    return {};
  }
  async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
    await applyToSignal(PeakFilterEffect, this, inputs, outputs);
  }
}

export const SIGNAL_EFFECT_NODES = [
  StreamingBitcrushNode,
  StreamingCompressNode,
  StreamingDistortionNode,
  StreamingLimiterNode,
  StreamingReverbNode,
  StreamingNoiseGateNode,
  StreamingPhaserNode,
  StreamingDelayNode,
  StreamingHighShelfFilterNode,
  StreamingLowShelfFilterNode,
  StreamingPeakFilterNode
];
