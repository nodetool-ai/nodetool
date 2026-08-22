import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  getFalApiKey,
  falSubmit,
  removeNulls,
  isRefSet,
  assetToFalUrl,
  imageToDataUrl,
} from "../fal-base.js";

// Re-export alias
const FalNode = BaseNode;

export class HunyuanVideo extends FalNode {
  static readonly nodeType = "fal.text_to_video.HunyuanVideo";
  static readonly title = "Hunyuan Video";
  static readonly description = `Hunyuan Video is Tencent's advanced text-to-video model for high-quality video generation.
video, generation, hunyuan, text-to-video, txt2vid`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "video": "video", "seed": "int" };

  @prop({ type: "enum", default: 129, values: ["129", "85"], description: "The number of frames to generate." })
  declare num_frames: any;

  @prop({ type: "enum", default: "720p", values: ["480p", "580p", "720p"], description: "The resolution of the video to generate." })
  declare resolution: any;

  @prop({ type: "enum", default: "16:9", values: ["16:9", "9:16"], description: "The aspect ratio of the video to generate." })
  declare aspect_ratio: any;

  @prop({ type: "str", default: "", description: "The prompt to generate the video from." })
  declare prompt: any;

  @prop({ type: "bool", default: false, description: "If set to true, the safety checker will be enabled. Disabling it requires account authorization; unauthorized requests are always checked." })
  declare enable_safety_checker: any;

  @prop({ type: "bool", default: false, description: "By default, generations are done with 35 steps. Pro mode does 55 steps which results in higher quality videos but will take more time and cost 2x more billing units." })
  declare pro_mode: any;

  @prop({ type: "str", default: "", description: "The seed to use for generating the video." })
  declare seed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const numFrames = String(this.num_frames ?? 129);
    const resolution = String(this.resolution ?? "720p");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const prompt = String(this.prompt ?? "");
    const enableSafetyChecker = Boolean(this.enable_safety_checker ?? false);
    const proMode = Boolean(this.pro_mode ?? false);
    const seed = String(this.seed ?? "");

    const args: Record<string, unknown> = {
      "num_frames": numFrames,
      "resolution": resolution,
      "aspect_ratio": aspectRatio,
      "prompt": prompt,
      "enable_safety_checker": enableSafetyChecker,
      "pro_mode": proMode,
      "seed": seed,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/hunyuan-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export const FAL_TEXT_TO_VIDEO_NODES: readonly NodeClass[] = [
  HunyuanVideo,
] as const;
