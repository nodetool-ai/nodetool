import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getReplicateApiKey,
  replicateSubmit,
  extractVersion,
  removeNulls,
  isRefSet,
  assetToUrl,
  outputToImageRef,
  outputToVideoRef,
  outputToAudioRef,
  outputToString,
} from "../replicate-base.js";

const ReplicateNode = BaseNode;

export class Runway_Upscale_V1 extends ReplicateNode {
  static readonly nodeType = "replicate.video_enhance.Runway_Upscale_V1";
  static readonly title = "Runway_ Upscale_ V1";
  static readonly description = `Upscale videos by 4x, up to a maximum of 4k
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "video", default: "", description: "Video to upscale. Videos must be shorter than 40s, less than 4096px per side, and less than 16MB." })
  declare video: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const args: Record<string, unknown> = {
    };

    const videoRef = inputs.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = assetToUrl(videoRef!);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, extractVersion("runwayml/upscale-v1").version, args);
    return { output: outputToVideoRef(res.output) };
  }
}

export class Topaz_Video_Upscale extends ReplicateNode {
  static readonly nodeType = "replicate.video_enhance.Topaz_Video_Upscale";
  static readonly title = "Topaz_ Video_ Upscale";
  static readonly description = `Video Upscaling from Topaz Labs
replicate, ai`;
  static readonly requiredSettings = ["REPLICATE_API_TOKEN"];

  @prop({ type: "video", default: "", description: "Video file to upscale" })
  declare video: any;

  @prop({ type: "int", default: 60, description: "Target FPS (choose from 15fps to 120fps)" })
  declare target_fps: any;

  @prop({ type: "enum", default: "1080p", values: ["720p", "1080p", "4k"], description: "Target resolution" })
  declare target_resolution: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getReplicateApiKey(inputs);
    const targetFps = Number(inputs.target_fps ?? this.target_fps ?? 60);
    const targetResolution = String(inputs.target_resolution ?? this.target_resolution ?? "1080p");

    const args: Record<string, unknown> = {
      "target_fps": targetFps,
      "target_resolution": targetResolution,
    };

    const videoRef = inputs.video as Record<string, unknown> | undefined;
    if (isRefSet(videoRef)) {
      const videoUrl = assetToUrl(videoRef!);
      if (videoUrl) args["video"] = videoUrl;
    }
    removeNulls(args);

    const res = await replicateSubmit(apiKey, extractVersion("topazlabs/video-upscale").version, args);
    return { output: outputToVideoRef(res.output) };
  }
}

export const REPLICATE_VIDEO_ENHANCE_NODES: readonly NodeClass[] = [
  Runway_Upscale_V1,
  Topaz_Video_Upscale,
] as const;