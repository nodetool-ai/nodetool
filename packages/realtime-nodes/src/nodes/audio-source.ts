import { BaseNode, prop } from "@nodetool/node-sdk";
import type { AudioFrame, InputBufferPolicy } from "@nodetool/protocol";

export class AudioSource extends BaseNode {
  static readonly nodeType = "nodetool.realtime.AudioSource";
  static readonly title = "Audio Source";
  static readonly description =
    "Realtime audio media source. PCM frames are pushed into this node by a realtime transport adapter.";
  static readonly metadataOutputTypes = {
    frame: "realtime_audio_frame"
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
    default: "audio",
    title: "Name",
    description: "The realtime input name used by session media-track routing."
  })
  declare name: string;

  @prop({
    type: "realtime_audio_frame",
    default: null,
    title: "Frame",
    description: "Optional default frame for non-live testing."
  })
  declare frame: AudioFrame | null;

  async process(): Promise<Record<string, unknown>> {
    return { frame: this.frame ?? null };
  }
}

export const AUDIO_SOURCE_NODES = [AudioSource] as const;
