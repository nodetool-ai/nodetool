import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getFalApiKey,
  falSubmit,
  removeNulls,
  isRefSet,
  assetToFalUrl,
  imageToDataUrl
} from "../fal-base.js";

// Re-export alias
const FalNode = BaseNode;

export class OpenrouterRouterVideoEnterprise extends FalNode {
  static readonly nodeType =
    "fal.video_to_text.OpenrouterRouterVideoEnterprise";
  static readonly title = "Openrouter Router Video Enterprise";
  static readonly description = `Run any VLM (Video Language Model) with fal, powered by OpenRouter.
video, transcription, analysis, video-understanding`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { usage: "str", output: "str" };

  @prop({
    type: "str",
    default: "",
    description: "Prompt to be used for the video processing"
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "List of URLs or data URIs of video files to process. Supported formats: mp4, mpeg, mov, webm. For Google Gemini on AI Studio, YouTube links are also supported. Mutually exclusive with video_url."
  })
  declare video_urls: any;

  @prop({
    type: "bool",
    default: false,
    description: "Should reasoning be the part of the final answer."
  })
  declare reasoning: any;

  @prop({
    type: "str",
    default: "",
    description: "System prompt to provide context or instructions to the model"
  })
  declare system_prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Name of the model to use. Charged based on actual token usage."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    description:
      "This sets the upper limit for the number of tokens the model can generate in response. It won't produce more than this limit. The maximum value is the context length minus the prompt length."
  })
  declare max_tokens: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "This setting influences the variety in the model's responses. Lower values lead to more predictable and typical responses, while higher values encourage more diverse and less common responses. At 0, the model always gives the same response for a given input."
  })
  declare temperature: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const reasoning = Boolean(this.reasoning ?? false);
    const systemPrompt = String(this.system_prompt ?? "");
    const model = String(this.model ?? "");
    const maxTokens = String(this.max_tokens ?? "");
    const temperature = Number(this.temperature ?? 1);

    const args: Record<string, unknown> = {
      prompt: prompt,
      reasoning: reasoning,
      system_prompt: systemPrompt,
      model: model,
      max_tokens: maxTokens,
      temperature: temperature
    };

    const videoUrlsRef = this.video_urls as Record<string, unknown> | undefined;
    if (isRefSet(videoUrlsRef)) {
      const videoUrlsUrl = await assetToFalUrl(apiKey, videoUrlsRef!);
      if (videoUrlsUrl) args["video_urls"] = videoUrlsUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "openrouter/router/video/enterprise",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class OpenrouterRouterVideo extends FalNode {
  static readonly nodeType = "fal.video_to_text.OpenrouterRouterVideo";
  static readonly title = "Openrouter Router Video";
  static readonly description = `Run any VLM (Video Language Model) with fal, powered by OpenRouter.
video, transcription, analysis, video-understanding`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { usage: "str", output: "str" };

  @prop({
    type: "str",
    default: "",
    description: "Prompt to be used for the video processing"
  })
  declare prompt: any;

  @prop({
    type: "video",
    default: "",
    description:
      "List of URLs or data URIs of video files to process. Supported formats: mp4, mpeg, mov, webm. For Google Gemini on AI Studio, YouTube links are also supported. Mutually exclusive with video_url."
  })
  declare video_urls: any;

  @prop({
    type: "bool",
    default: false,
    description: "Should reasoning be the part of the final answer."
  })
  declare reasoning: any;

  @prop({
    type: "str",
    default: "",
    description: "System prompt to provide context or instructions to the model"
  })
  declare system_prompt: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Name of the model to use. Charged based on actual token usage."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    description:
      "This sets the upper limit for the number of tokens the model can generate in response. It won't produce more than this limit. The maximum value is the context length minus the prompt length."
  })
  declare max_tokens: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "This setting influences the variety in the model's responses. Lower values lead to more predictable and typical responses, while higher values encourage more diverse and less common responses. At 0, the model always gives the same response for a given input."
  })
  declare temperature: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const reasoning = Boolean(this.reasoning ?? false);
    const systemPrompt = String(this.system_prompt ?? "");
    const model = String(this.model ?? "");
    const maxTokens = String(this.max_tokens ?? "");
    const temperature = Number(this.temperature ?? 1);

    const args: Record<string, unknown> = {
      prompt: prompt,
      reasoning: reasoning,
      system_prompt: systemPrompt,
      model: model,
      max_tokens: maxTokens,
      temperature: temperature
    };

    const videoUrlsRef = this.video_urls as Record<string, unknown> | undefined;
    if (isRefSet(videoUrlsRef)) {
      const videoUrlsUrl = await assetToFalUrl(apiKey, videoUrlsRef!);
      if (videoUrlsUrl) args["video_urls"] = videoUrlsUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "openrouter/router/video", args);
    return res as Record<string, unknown>;
  }
}

export const FAL_VIDEO_TO_TEXT_NODES: readonly NodeClass[] = [
  OpenrouterRouterVideoEnterprise,
  OpenrouterRouterVideo
] as const;
