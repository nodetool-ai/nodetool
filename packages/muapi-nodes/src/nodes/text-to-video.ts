import { BaseNode, prop, type VideoRef } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import {
  getMuapiApiKey,
  normalizeMuapiVideoDuration,
  runMuapiMedia,
  videoRefFromBytes,
  MUAPI_VIDEO_ASPECT_RATIOS,
  MUAPI_MAX_DURATION,
  MUAPI_MIN_DURATION,
  MUAPI_VIDEO_RESOLUTIONS,
  MUAPI_TEXT_TO_VIDEO_ENDPOINT
} from "../muapi-base.js";

type MuapiTextToVideoOutputs = { output: VideoRef };

export class MuapiTextToVideoNode extends BaseNode {
  static readonly nodeType = "muapi.TextToVideo";
  static readonly body = "content_card";
  static readonly title = "MuAPI Text to Video";
  static readonly description =
    "Generate a video from a text prompt using MuAPI's FLUX 3 video route.\n" +
    "video, generation, text-to-video, t2v, muapi\n\n" +
    "Use cases:\n" +
    "- Create short cinematic clips\n" +
    "- Prototype motion concepts\n" +
    "- Generate B-roll and social content";
  static readonly metadataOutputTypes = { output: "video" };
  static readonly inlineFields = ["prompt"];
  static readonly inputFields = ["prompt"];
  static readonly requiredSettings = ["MUAPI_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Text prompt describing the desired video."
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

  async process(context?: ProcessingContext): Promise<MuapiTextToVideoOutputs> {
    const prompt = String(this.prompt ?? "").trim();
    if (!prompt) throw new Error("Prompt is required");

    const bytes = await runMuapiMedia({
      apiKey: getMuapiApiKey(this._secrets),
      endpoint: MUAPI_TEXT_TO_VIDEO_ENDPOINT,
      payload: {
        prompt,
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

export const TEXT_TO_VIDEO_NODES: readonly NodeClass[] = [
  MuapiTextToVideoNode
];
