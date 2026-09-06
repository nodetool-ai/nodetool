import { BaseNode, prop, type ImageRef, type VideoRef } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import {
  getMuapiApiKey,
  muapiUploadImage,
  normalizeMuapiVideoDuration,
  resolveInputImageBytes,
  runMuapiMedia,
  videoRefFromBytes,
  MUAPI_VIDEO_ASPECT_RATIOS,
  MUAPI_IMAGE_TO_VIDEO_ENDPOINT,
  MUAPI_MAX_DURATION,
  MUAPI_MIN_DURATION,
  MUAPI_VIDEO_RESOLUTIONS
} from "../muapi-base.js";

const EMPTY_IMAGE: ImageRef = {
  type: "image",
  uri: "",
  asset_id: null,
  data: null
};

type MuapiImageToVideoOutputs = { output: VideoRef };

export class MuapiImageToVideoNode extends BaseNode {
  static readonly nodeType = "muapi.ImageToVideo";
  static readonly body = "content_card";
  static readonly title = "MuAPI Image to Video";
  static readonly description =
    "Animate an input image into a video using MuAPI's FLUX 3 video route.\n" +
    "video, generation, image-to-video, i2v, muapi\n\n" +
    "Use cases:\n" +
    "- Bring a still image to life\n" +
    "- Add motion to product or character art\n" +
    "- Create animated intros from a key frame";
  static readonly metadataOutputTypes = { output: "video" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["image", "prompt"];
  static readonly requiredSettings = ["MUAPI_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "image",
    default: EMPTY_IMAGE,
    title: "Image",
    description: "The image to use as the video's starting frame."
  })
  declare image: ImageRef;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Text prompt describing the desired motion."
  })
  declare prompt: string;

  @prop({
    type: "enum",
    default: "16:9",
    title: "Aspect Ratio",
    description: "Aspect ratio of the generated video.",
    values: MUAPI_VIDEO_ASPECT_RATIOS
  })
  declare aspect_ratio: string;

  @prop({
    type: "enum",
    default: "720p",
    title: "Resolution",
    description: "Output video resolution.",
    values: MUAPI_VIDEO_RESOLUTIONS
  })
  declare resolution: string;

  @prop({
    type: "int",
    default: 5,
    title: "Duration",
    description: "Video duration in seconds.",
    min: MUAPI_MIN_DURATION,
    max: MUAPI_MAX_DURATION
  })
  declare duration: number;

  @prop({
    type: "bool",
    default: true,
    title: "Generate Audio",
    description: "Generate synchronized native audio when supported."
  })
  declare generate_audio: boolean;

  async process(context?: ProcessingContext): Promise<MuapiImageToVideoOutputs> {
    const prompt = String(this.prompt ?? "").trim();
    if (!prompt) throw new Error("Prompt is required");

    const apiKey = getMuapiApiKey(this._secrets);
    const imageBytes = await resolveInputImageBytes(this.image, context);
    const imageUrl = await muapiUploadImage(apiKey, imageBytes, context?.signal);

    const bytes = await runMuapiMedia({
      apiKey,
      endpoint: MUAPI_IMAGE_TO_VIDEO_ENDPOINT,
      payload: {
        prompt,
        images_list: [imageUrl],
        aspect_ratio: String(this.aspect_ratio ?? "16:9"),
        resolution: String(this.resolution ?? "720p"),
        duration: normalizeMuapiVideoDuration(this.duration),
        generate_audio: Boolean(this.generate_audio ?? true)
      },
      kind: "video",
      signal: context?.signal
    });
    return { output: videoRefFromBytes(bytes) };
  }
}

export const IMAGE_TO_VIDEO_NODES: readonly NodeClass[] = [
  MuapiImageToVideoNode
];
