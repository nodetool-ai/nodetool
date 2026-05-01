import { BaseNode, prop } from "@nodetool/node-sdk";
import type { InputBufferPolicy, RealtimeMediaBus, VideoFrame } from "@nodetool/protocol";
import type {
  ProcessingContext,
  StreamingInputs,
  StreamingOutputs
} from "@nodetool/runtime";

export class VideoPassthrough extends BaseNode {
  static readonly nodeType = "nodetool.realtime.VideoPassthrough";
  static readonly title = "Video Passthrough";
  static readonly description =
    "Show the live camera feed through the realtime graph unchanged so routing and preview can be checked before loading a model.\nTags: realtime, video, passthrough, camera, preview, routing, baseline";
  static readonly metadataOutputTypes = {
    frame: "realtime_video_frame"
  };
  static readonly isStreamingInput = true;
  static readonly isStreamingOutput = true;
  static readonly isRealtimeCapable = true;
  static readonly inputBufferPolicy: Record<string, InputBufferPolicy> = {
    frame: { capacity: 2, overflowPolicy: "drop_oldest" }
  };

  @prop({
    type: "realtime_video_frame",
    default: null,
    title: "Frame",
    description: "The incoming realtime video frame to forward unchanged."
  })
  declare frame: VideoFrame | null;

  async process(): Promise<Record<string, unknown>> {
    return { frame: this.frame ?? null };
  }

  async onRealtimeTick(
    ctx: ProcessingContext,
    bus: RealtimeMediaBus,
    sessionId: string
  ): Promise<void> {
    const incoming = ctx.getRealtimeIncomingFrames?.();
    const frame = incoming?.frame ?? null;
    if (frame) {
      bus.setOutput(sessionId, this.__node_id, "frame", frame);
    }
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

export const VIDEO_PASSTHROUGH_NODES = [VideoPassthrough] as const;
