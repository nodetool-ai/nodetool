import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  getFalApiKey,
  falSubmit,
  removeNulls,
  isRefSet,
  assetToFalUrl,
  imageToDataUrl,
  coerceFalOutputForPropType,
} from "../fal-base.js";
import type { FalUnitPricing } from "../fal-base.js";

// Re-export alias
const FalNode = BaseNode;

export class WorkflowUtilitiesInterleaveVideo extends FalNode {
  static readonly nodeType = "fal.unknown.WorkflowUtilitiesInterleaveVideo";
  static readonly title = "Workflow Utilities Interleave Video";
  static readonly description = `ffmpeg utility to interleave videos
utility, processing, general`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "video": "video" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/workflow-utilities/interleave-video",
    unitPrice: 0.00017,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  @prop({ type: "list[video]", default: [], description: "List of video URLs to interleave in order" })
  declare video_urls: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {
    };

    const videoUrlsList = this.video_urls as Record<string, unknown>[] | undefined;
    if (videoUrlsList?.length) {
      const videoUrlsUrls: string[] = [];
      for (const ref of videoUrlsList) {
        if (isRefSet(ref)) { const u = await assetToFalUrl(apiKey, ref); if (u) videoUrlsUrls.push(u); }
      }
      if (videoUrlsUrls.length) args["video_urls"] = videoUrlsUrls;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/workflow-utilities/interleave-video", args);
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class OpenrouterRouterAudio extends FalNode {
  static readonly nodeType = "fal.unknown.OpenrouterRouterAudio";
  static readonly title = "Openrouter Router Audio";
  static readonly description = `Run any ALM (Audio Language Model) with fal, powered by OpenRouter.
utility, processing, general`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "usage": "str", "output": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "openrouter/router/audio",
    unitPrice: 0.01,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Prompt to be used for the audio processing" })
  declare prompt: any;

  @prop({ type: "str", default: "", description: "System prompt to provide context or instructions to the model" })
  declare system_prompt: any;

  @prop({ type: "bool", default: false, description: "Should reasoning be the part of the final answer." })
  declare reasoning: any;

  @prop({ type: "str", default: "", description: "Name of the model to use. Charged based on actual token usage." })
  declare model: any;

  @prop({ type: "audio", default: "", description: "URL or data URI of the audio file to process. Supported formats: wav, mp3, aiff, aac, ogg, flac, m4a." })
  declare audio: any;

  @prop({ type: "float", default: 1, description: "This setting influences the variety in the model's responses. Lower values lead to more predictable and typical responses, while higher values encourage more diverse and less common responses. At 0, the model always gives the same response for a given input." })
  declare temperature: any;

  @prop({ type: "str", default: "", description: "This sets the upper limit for the number of tokens the model can generate in response. It won't produce more than this limit. The maximum value is the context length minus the prompt length." })
  declare max_tokens: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const systemPrompt = String(this.system_prompt ?? "");
    const reasoning = Boolean(this.reasoning ?? false);
    const model = String(this.model ?? "");
    const temperature = Number(this.temperature ?? 1);
    const maxTokens = String(this.max_tokens ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "system_prompt": systemPrompt,
      "reasoning": reasoning,
      "model": model,
      "temperature": temperature,
      "max_tokens": maxTokens,
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "openrouter/router/audio", args);
    return {
      "usage": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["usage"]),
      "output": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["output"]),
    };
  }
}

export const FAL_UNKNOWN_NODES: readonly NodeClass[] = [
  WorkflowUtilitiesInterleaveVideo,
  OpenrouterRouterAudio,
] as const;