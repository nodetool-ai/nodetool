import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { loadMediaRefBytes } from "@nodetool-ai/runtime";
import {
  bytesToBase64,
  generateVideo,
  getMinimaxApiKey,
  inferImageMime,
  MINIMAX_I2V_MODELS,
  MINIMAX_VIDEO_DURATIONS,
  MINIMAX_VIDEO_RESOLUTIONS,
  videoRefFromBytes,
  videoRenderSettings
} from "../minimax-base.js";

export class MinimaxImageToVideoNode extends BaseNode {
  static readonly nodeType = "minimax.ImageToVideo";
  static readonly body = "content_card";
  static readonly title = "MiniMax Image to Video";
  static readonly description =
    "Animate a still image into a video using MiniMax Hailuo and Director " +
    "models. The image becomes the first frame (or the character reference " +
    "for S2V-01).\n" +
    "video, generation, image-to-video, i2v, hailuo, minimax\n\n" +
    "Use cases:\n" +
    "- Bring a photo or render to life\n" +
    "- Add motion to product or character art\n" +
    "- Create animated intros from a key frame";
  static readonly metadataOutputTypes = { output: "video" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["image", "prompt"];
  static readonly requiredSettings = ["MINIMAX_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "enum",
    default: "MiniMax-Hailuo-02",
    title: "Model",
    description: "The MiniMax video model to use.",
    values: MINIMAX_I2V_MODELS
  })
  declare model: any;

  @prop({
    type: "image",
    default: { type: "image", uri: "", asset_id: null, data: null },
    title: "Image",
    description:
      "The image to use as the first frame of the video (S2V-01 uses it as " +
      "a character reference instead)."
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description:
      "Optional text prompt guiding the motion. Director models support camera " +
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const apiKey = getMinimaxApiKey(this._secrets);

    const imageBytes = await loadMediaRefBytes(this.image, context);
    if (!imageBytes || imageBytes.length === 0) {
      throw new Error("An input image is required");
    }
    const mime = inferImageMime(imageBytes);

    const model = String(this.model ?? "MiniMax-Hailuo-02");
    const dataUrl = `data:${mime};base64,${bytesToBase64(imageBytes)}`;
    const body: Record<string, unknown> = {
      model,
      ...videoRenderSettings(
        model,
        Number(this.duration ?? 6),
        String(this.resolution ?? "768P")
      )
    };
    if (model === "S2V-01") {
      // S2V-01 animates a character reference, not a first frame, and
      // rejects first_frame_image.
      body.subject_reference = [{ type: "character", image: [dataUrl] }];
    } else {
      body.first_frame_image = dataUrl;
    }
    const prompt = String(this.prompt ?? "");
    if (prompt) body.prompt = prompt;

    const bytes = await generateVideo(apiKey, body);
    return { output: videoRefFromBytes(bytes) };
  }
}

export const IMAGE_TO_VIDEO_NODES: readonly NodeClass[] = [
  MinimaxImageToVideoNode
];
