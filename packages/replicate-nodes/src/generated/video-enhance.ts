import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getReplicateApiKey,
  replicateSubmit,
  removeNulls,
  isRefSet,
  assetToUrl,
  outputToImageRef,
  outputToVideoRef,
  outputToAudioRef,
  outputToString
} from "../replicate-base.js";

const ReplicateNode = BaseNode;

export class Topaz_Video_Upscale extends ReplicateNode {
  static readonly nodeType = "replicate.video.enhance.Topaz_Video_Upscale";
  static readonly title = "Topaz_ Video_ Upscale";
  static readonly description = `Video Upscaling from Topaz Labs
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "int",
    default: 30,
    description: "Target FPS (choose from 15-60fps)"
  })
  declare target_fps: any;

  @prop({
    type: "enum",
    default: "1080p",
    values: ["720p", "1080p", "4k"],
    description: "Target resolution"
  })
  declare target_resolution: any;

  @prop({ type: "video", default: "", description: "Video file to upscale" })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(this._secrets);
    const targetFps = Number(this.target_fps ?? 30);
    const targetResolution = String(this.target_resolution ?? "1080p");

    const args: Record<string, unknown> = {
      target_fps: targetFps,
      target_resolution: targetResolution
    };

    const videoRef = this.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = await assetToUrl(videoRef!, apiKey);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(
      apiKey,
      "topazlabs/video-upscale:f4dad23bbe2d0bf4736d2ea8c9156f1911d8eeb511c8d0bb390931e25caaef61",
      args
    );
    return { output: outputToVideoRef(res.output) };
  }
}

export const REPLICATE_VIDEO_ENHANCE_NODES: readonly NodeClass[] = [
  Topaz_Video_Upscale
] as const;
