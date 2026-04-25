import { BaseNode, prop } from "@nodetool/node-sdk";
import type { InputBufferPolicy, VideoFrame } from "@nodetool/protocol";

export class VideoSource extends BaseNode {
  static readonly nodeType = "nodetool.realtime.VideoSource";
  static readonly title = "Video Source";
  static readonly description =
    "Realtime video media source. Frames are pushed into this node by a realtime transport adapter.";
  static readonly metadataOutputTypes = {
    frame: "realtime_video_frame"
  };
  static readonly basicFields = ["name"];
  static readonly isStreamingOutput = true;
  static readonly isRealtimeCapable = true;
  static readonly isMediaAdapter = true;
  static readonly inputBufferPolicy: Record<string, InputBufferPolicy> = {
    frame: { capacity: 2, overflowPolicy: "drop_oldest" }
  };

  @prop({
    type: "str",
    default: "video",
    title: "Name",
    description: "The realtime input name used by session media-track routing."
  })
  declare name: string;

  @prop({
    type: "realtime_video_frame",
    default: null,
    title: "Frame",
    description: "Optional default frame for non-live testing."
  })
  declare frame: VideoFrame | null;

  async process(): Promise<Record<string, unknown>> {
    return { frame: this.frame ?? null };
  }
}

export const VIDEO_SOURCE_NODES = [VideoSource] as const;
