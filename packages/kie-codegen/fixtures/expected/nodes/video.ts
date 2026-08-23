import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  getApiKey,
  kieExecuteTask,
  isRefSet,
} from "../kie-base.js";

export class Kling26TextToVideoNode extends BaseNode {
  static readonly nodeType = "kie.video.Kling26TextToVideo";
  static readonly title = "Kling 2.6 Text to Video";
  static readonly description = `Kling 2.6 Text to Video via Kie.ai.

    kie, video, ai

    ## Query Task Status`;
  static readonly metadataOutputTypes = { output: "video" };
  static readonly requiredSettings = ["KIE_API_KEY"];
  static readonly inlineFields = [];
  static readonly inputFields = ["prompt"];

  @prop({ type: "str", default: "", title: "Prompt", description: "Text prompt for video generation (maximum length: 1000 characters)", max: 1000 })
  declare prompt: any;

  @prop({ type: "bool", default: false, title: "Sound", description: "This parameter specifies whether the generated video contains sound (boolean: true/false)" })
  declare sound: any;

  @prop({ type: "enum", default: "1:1", values: ["1:1","16:9","9:16"], title: "Aspect Ratio", description: "This parameter defines the video aspect ratio" })
  declare aspect_ratio: any;

  @prop({ type: "enum", default: "5", values: ["5","10"], title: "Duration", description: "Video duration (unit: seconds)" })
  declare duration: any;

  async process(context?: Parameters<BaseNode["process"]>[0]): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    if (!String(this.prompt ?? "").trim()) throw new Error("Prompt is required");
    if (!String(this.aspect_ratio ?? "").trim()) throw new Error("Aspect Ratio is required");
    if (!String(this.duration ?? "").trim()) throw new Error("Duration is required");
    const params: Record<string, unknown> = {};
    params["prompt"] = String(this.prompt ?? "");
    params["sound"] = Boolean(this.sound ?? false);
    params["aspect_ratio"] = String(this.aspect_ratio ?? "1:1");
    params["duration"] = String(this.duration ?? "5");

    const result = await kieExecuteTask(apiKey, "kling-2.6/text-to-video", params, 8000, 450);
    return { output: { type: "video", data: result.data } };
  }
}

export const KIE_VIDEO_NODES: readonly NodeClass[] = [
  Kling26TextToVideoNode,
] as const;
