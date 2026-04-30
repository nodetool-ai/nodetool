import { BaseNode, prop } from "@nodetool/node-sdk";
import type { InputBufferPolicy, VideoFrame } from "@nodetool/protocol";
import type {
  ProcessingContext,
  StreamingInputs,
  StreamingOutputs
} from "@nodetool/runtime";

export class VideoSink extends BaseNode {
  static readonly nodeType = "nodetool.realtime.VideoSink";
  static readonly title = "Video Sink";
  static readonly description =
    "Send live video frames to the realtime preview or to an output transport.\nTags: realtime, video, sink, preview, output, transport";
  static readonly metadataOutputTypes = {
    frame: "realtime_video_frame"
  };
  static readonly isStreamingInput = true;
  static readonly isRealtimeCapable = true;
  static readonly isMediaAdapter = true;
  static readonly inputBufferPolicy: Record<string, InputBufferPolicy> = {
    frame: { capacity: 2, overflowPolicy: "drop_oldest" }
  };

  @prop({
    type: "realtime_video_frame",
    default: null,
    title: "Frame",
    description: "The incoming realtime video frame."
  })
  declare frame: VideoFrame | null;

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

export const VIDEO_SINK_NODES = [VideoSink] as const;
