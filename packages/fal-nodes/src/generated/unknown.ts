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

export class WorkflowUtilitiesInterleaveVideo extends FalNode {
  static readonly nodeType = "fal.unknown.WorkflowUtilitiesInterleaveVideo";
  static readonly title = "Workflow Utilities Interleave Video";
  static readonly description = `ffmpeg utility to interleave videos
utility, processing, general`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { video: "video" };

  @prop({
    type: "list[video]",
    default: [],
    description: "List of video URLs to interleave in order"
  })
  declare video_urls: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};

    const videoUrlsList = this.video_urls as
      | Record<string, unknown>[]
      | undefined;
    if (videoUrlsList?.length) {
      const videoUrlsUrls: string[] = [];
      for (const ref of videoUrlsList) {
        if (isRefSet(ref)) {
          const u = await assetToFalUrl(apiKey, ref);
          if (u) videoUrlsUrls.push(u);
        }
      }
      if (videoUrlsUrls.length) args["video_urls"] = videoUrlsUrls;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/workflow-utilities/interleave-video",
      args
    );
    return { output: { type: "video", uri: (res.video as any).url } };
  }
}

export class Qwen3TtsCloneVoice17b extends FalNode {
  static readonly nodeType = "fal.unknown.Qwen3TtsCloneVoice17b";
  static readonly title = "Qwen3 Tts Clone Voice17b";
  static readonly description = `Clone your voices using Qwen3-TTS Clone-Voice model with zero shot cloning capabilities and use it on text-to-speech models to create speeches of yours!
utility, processing, general`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { speaker_embedding: "str" };

  @prop({
    type: "audio",
    default: "",
    description: "URL to the reference audio file used for voice cloning."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional reference text that was used when creating the speaker embedding. Providing this can improve synthesis quality when using a cloned voice."
  })
  declare reference_text: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const referenceText = String(this.reference_text ?? "");

    const args: Record<string, unknown> = {
      reference_text: referenceText
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/qwen-3-tts/clone-voice/1.7b",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class Qwen3TtsCloneVoice06b extends FalNode {
  static readonly nodeType = "fal.unknown.Qwen3TtsCloneVoice06b";
  static readonly title = "Qwen3 Tts Clone Voice06b";
  static readonly description = `Clone your voices using Qwen3-TTS Clone-Voice model with zero shot cloning capabilities and use it on text-to-speech models to create speeches of yours!
utility, processing, general`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { speaker_embedding: "str" };

  @prop({
    type: "audio",
    default: "",
    description: "URL to the reference audio file used for voice cloning."
  })
  declare audio: any;

  @prop({
    type: "str",
    default: "",
    description:
      "Optional reference text that was used when creating the speaker embedding. Providing this can improve synthesis quality when using a cloned voice."
  })
  declare reference_text: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const referenceText = String(this.reference_text ?? "");

    const args: Record<string, unknown> = {
      reference_text: referenceText
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "fal-ai/qwen-3-tts/clone-voice/0.6b",
      args
    );
    return res as Record<string, unknown>;
  }
}

export class OpenrouterRouterAudio extends FalNode {
  static readonly nodeType = "fal.unknown.OpenrouterRouterAudio";
  static readonly title = "Openrouter Router Audio";
  static readonly description = `Run any ALM (Audio Language Model) with fal, powered by OpenRouter.
utility, processing, general`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { usage: "str", output: "str" };

  @prop({
    type: "str",
    default: "",
    description: "Prompt to be used for the audio processing"
  })
  declare prompt: any;

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
    type: "audio",
    default: "",
    description:
      "URL or data URI of the audio file to process. Supported formats: wav, mp3, aiff, aac, ogg, flac, m4a."
  })
  declare audio: any;

  @prop({
    type: "float",
    default: 1,
    description:
      "This setting influences the variety in the model's responses. Lower values lead to more predictable and typical responses, while higher values encourage more diverse and less common responses. At 0, the model always gives the same response for a given input."
  })
  declare temperature: any;

  @prop({
    type: "str",
    default: "",
    description:
      "This sets the upper limit for the number of tokens the model can generate in response. It won't produce more than this limit. The maximum value is the context length minus the prompt length."
  })
  declare max_tokens: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const reasoning = Boolean(this.reasoning ?? false);
    const systemPrompt = String(this.system_prompt ?? "");
    const model = String(this.model ?? "");
    const temperature = Number(this.temperature ?? 1);
    const maxTokens = String(this.max_tokens ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      reasoning: reasoning,
      system_prompt: systemPrompt,
      model: model,
      temperature: temperature,
      max_tokens: maxTokens
    };

    const audioRef = this.audio as Record<string, unknown> | undefined;
    if (isRefSet(audioRef)) {
      const audioUrl = await assetToFalUrl(apiKey, audioRef!);
      if (audioUrl) args["audio_url"] = audioUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "openrouter/router/audio", args);
    return res as Record<string, unknown>;
  }
}

export const FAL_UNKNOWN_NODES: readonly NodeClass[] = [
  WorkflowUtilitiesInterleaveVideo,
  Qwen3TtsCloneVoice17b,
  Qwen3TtsCloneVoice06b,
  OpenrouterRouterAudio
] as const;
