import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import {
  generateVideo,
  getMinimaxApiKey,
  MINIMAX_T2V_MODELS,
  MINIMAX_VIDEO_DURATIONS,
  MINIMAX_VIDEO_RESOLUTIONS,
  videoRefFromBytes,
  videoRenderSettings
} from "../minimax-base.js";

export class MinimaxTextToVideoNode extends BaseNode {
  static readonly nodeType = "minimax.TextToVideo";
  static readonly body = "content_card";
  static readonly title = "MiniMax Text to Video";
  static readonly description =
    "Generate video from a text prompt using MiniMax Hailuo and Director " +
    "models.\n" +
    "video, generation, text-to-video, t2v, hailuo, minimax\n\n" +
    "Use cases:\n" +
    "- Create short cinematic clips from a description\n" +
    "- Prototype motion concepts\n" +
    "- Generate B-roll and social content";
  static readonly metadataOutputTypes = { output: "video" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["prompt"];
  static readonly requiredSettings = ["MINIMAX_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "enum",
    default: "MiniMax-Hailuo-02",
    title: "Model",
    description: "The MiniMax video model to use.",
    values: MINIMAX_T2V_MODELS
  })
  declare model: any;

  @prop({
    type: "str",
    default: "A cat playing with a ball of yarn",
    title: "Prompt",
    description:
      "Text prompt describing the video. Director models support camera " +
      "moves like [Push in], [Pan left], [Truck left]."
  })
  declare prompt: any;

  @prop({
    type: "int",
    default: 6,
    title: "Duration",
    description: "Video duration in seconds.",
    values: MINIMAX_VIDEO_DURATIONS
  })
  declare duration: any;

  @prop({
    type: "enum",
    default: "768P",
    title: "Resolution",
    description: "Output resolution.",
    values: MINIMAX_VIDEO_RESOLUTIONS
  })
  declare resolution: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getMinimaxApiKey(this._secrets);

    const prompt = String(this.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");

    const model = String(this.model ?? "MiniMax-Hailuo-02");
    const body: Record<string, unknown> = {
      model,
      prompt,
      ...videoRenderSettings(
        model,
        Number(this.duration ?? 6),
        String(this.resolution ?? "768P")
      )
    };

    const bytes = await generateVideo(apiKey, body);
    return { output: videoRefFromBytes(bytes) };
  }
}

export const TEXT_TO_VIDEO_NODES: readonly NodeClass[] = [
  MinimaxTextToVideoNode
];
