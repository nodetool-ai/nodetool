import { BaseNode, prop } from "@nodetool/node-sdk";
import type { AudioFrame, InputBufferPolicy } from "@nodetool/protocol";
import type {
  ProcessingContext,
  StreamingInputs,
  StreamingOutputs
} from "@nodetool/runtime";

export class AudioSink extends BaseNode {
  static readonly nodeType = "nodetool.realtime.AudioSink";
  static readonly title = "Audio Sink";
  static readonly description =
    "Realtime audio media sink. Emits incoming PCM frames for preview or outbound transport adapters.";
  static readonly metadataOutputTypes = {
    frame: "realtime_audio_frame"
  };
  static readonly isStreamingInput = true;
  static readonly isRealtimeCapable = true;
  static readonly isMediaAdapter = true;
  static readonly inputBufferPolicy: Record<string, InputBufferPolicy> = {
    frame: { capacity: 2, overflowPolicy: "drop_oldest" }
  };

  @prop({
    type: "realtime_audio_frame",
    default: null,
    title: "Frame",
    description: "The incoming realtime audio frame."
  })
  declare frame: AudioFrame | null;

  async process(): Promise<Record<string, unknown>> {
    return { frame: this.frame ?? null };
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs,
    _context?: ProcessingContext
  ): Promise<void> {
    for await (const frame of inputs.stream("frame")) {
      await outputs.emit("frame", frame);
    }
  }
}

export const AUDIO_SINK_NODES = [AudioSink] as const;
