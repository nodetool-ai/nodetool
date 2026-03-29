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

export class BytedanceSeedV2Mini extends FalNode {
  static readonly nodeType = "fal.llm.BytedanceSeedV2Mini";
  static readonly title = "Bytedance Seed V2 Mini";
  static readonly description = `Seed 2.0 Mini is a high-performance multimodal model optimized for low latency and high concurrency. It supports text, image, and video input with 256K context and configurable thinking/reasoning modes.
fal, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "reasoning_content": "str", "output": "str", "messages": "list[Seed2MiniMessage]" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/bytedance/seed/v2/mini",
    unitPrice: 0.0001,
    billingUnit: "1000 tokens",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The text prompt or question for the model." })
  declare prompt: any;

  @prop({ type: "list[video]", default: [], description: "URLs of videos for video understanding. Supported formats: MP4, MOV. Audio comprehension is not supported. A maximum of 3 videos is supported. Any additional videos will be ignored." })
  declare video_urls: any;

  @prop({ type: "float", default: 0.7, description: "Nucleus sampling parameter. The model considers tokens with top_p cumulative probability mass. Lower values narrow the token selection." })
  declare top_p: any;

  @prop({ type: "str", default: "", description: "Optional system prompt to guide the model's behavior." })
  declare system_prompt: any;

  @prop({ type: "enum", default: "enabled", values: ["enabled", "disabled", "auto"], description: "Controls the model's chain-of-thought reasoning. 'enabled' always includes reasoning, 'disabled' never includes reasoning, 'auto' lets the model decide based on the query." })
  declare thinking: any;

  @prop({ type: "str", default: "", description: "Controls the depth of reasoning before the model responds. Only applicable when 'thinking' is 'enabled' or 'auto'. 'minimal' for immediate response, 'low' for faster response with light reasoning, 'medium' for balanced speed and depth, 'high' for deep analysis of complex issues." })
  declare reasoning_effort: any;

  @prop({ type: "float", default: 1, description: "Controls randomness in the response. Lower values make output more focused and deterministic, higher values make it more creative." })
  declare temperature: any;

  @prop({ type: "list[image]", default: [], description: "URLs of images for visual understanding. Supported formats: JPEG, PNG, WebP. A maximum of 6 images is supported. Any additional images will be ignored." })
  declare images: any;

  @prop({ type: "str", default: "", description: "Optional prior conversation history for multi-turn conversations. Pass back the 'messages' field from a previous response to provide context. The current 'prompt', 'image_urls', 'video_urls', and 'system_prompt' are always appended as the latest user turn." })
  declare messages: any;

  @prop({ type: "int", default: 4096, description: "Controls the maximum length of the model's output, including both the model's response and its chain-of-thought content, measured in tokens." })
  declare max_completion_tokens: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const topP = Number(this.top_p ?? 0.7);
    const systemPrompt = String(this.system_prompt ?? "");
    const thinking = String(this.thinking ?? "enabled");
    const reasoningEffort = String(this.reasoning_effort ?? "");
    const temperature = Number(this.temperature ?? 1);
    const messages = String(this.messages ?? "");
    const maxCompletionTokens = Number(this.max_completion_tokens ?? 4096);

    const args: Record<string, unknown> = {
      "prompt": prompt,
      "top_p": topP,
      "system_prompt": systemPrompt,
      "thinking": thinking,
      "reasoning_effort": reasoningEffort,
      "temperature": temperature,
      "messages": messages,
      "max_completion_tokens": maxCompletionTokens,
    };

    const videoUrlsList = this.video_urls as Record<string, unknown>[] | undefined;
    if (videoUrlsList?.length) {
      const videoUrlsUrls: string[] = [];
      for (const ref of videoUrlsList) {
        if (isRefSet(ref)) { const u = await assetToFalUrl(apiKey, ref); if (u) videoUrlsUrls.push(u); }
      }
      if (videoUrlsUrls.length) args["video_urls"] = videoUrlsUrls;
    }

    const imagesList = this.images as Record<string, unknown>[] | undefined;
    if (imagesList?.length) {
      const imagesUrls: string[] = [];
      for (const ref of imagesList) {
        if (isRefSet(ref)) { const u = await assetToFalUrl(apiKey, ref); if (u) imagesUrls.push(u); }
      }
      if (imagesUrls.length) args["image_urls"] = imagesUrls;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/bytedance/seed/v2/mini", args);
    return {
      "reasoning_content": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["reasoning_content"]),
      "output": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["output"]),
      "messages": coerceFalOutputForPropType("list[Seed2MiniMessage]", (res as Record<string, unknown>)["messages"]),
    };
  }
}

export class Qwen3Guard extends FalNode {
  static readonly nodeType = "fal.llm.Qwen3Guard";
  static readonly title = "Qwen3 Guard";
  static readonly description = `Qwen 3 Guard provides content safety and moderation using Qwen's LLM.
llm, safety, moderation, qwen, guard`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "categories": "list[str]", "label": "enum" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "fal-ai/qwen-3-guard",
    unitPrice: 0.002,
    billingUnit: "1000 tokens",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "The input text to be classified" })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      "prompt": prompt,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/qwen-3-guard", args);
    return {
      "categories": coerceFalOutputForPropType("list[str]", (res as Record<string, unknown>)["categories"]),
      "label": coerceFalOutputForPropType("enum", (res as Record<string, unknown>)["label"]),
    };
  }
}

export class OpenRouter extends FalNode {
  static readonly nodeType = "fal.llm.OpenRouter";
  static readonly title = "Open Router";
  static readonly description = `OpenRouter provides unified access to any LLM (Large Language Model) through a single API.
llm, chat, openrouter, multimodel, language-model`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { "usage": "str", "error": "str", "partial": "bool", "reasoning": "str", "output": "str" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "openrouter/router",
    unitPrice: 0.01,
    billingUnit: "units",
    currency: "USD",
  };

  @prop({ type: "str", default: "", description: "Name of the model to use. Charged based on actual token usage." })
  declare model: any;

  @prop({ type: "str", default: "", description: "Prompt to be used for the chat completion" })
  declare prompt: any;

  @prop({ type: "str", default: "", description: "This sets the upper limit for the number of tokens the model can generate in response. It won't produce more than this limit. The maximum value is the context length minus the prompt length." })
  declare max_tokens: any;

  @prop({ type: "float", default: 1, description: "This setting influences the variety in the model's responses. Lower values lead to more predictable and typical responses, while higher values encourage more diverse and less common responses. At 0, the model always gives the same response for a given input." })
  declare temperature: any;

  @prop({ type: "str", default: "", description: "System prompt to provide context or instructions to the model" })
  declare system_prompt: any;

  @prop({ type: "bool", default: false, description: "Should reasoning be the part of the final answer." })
  declare reasoning: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const model = String(this.model ?? "");
    const prompt = String(this.prompt ?? "");
    const maxTokens = String(this.max_tokens ?? "");
    const temperature = Number(this.temperature ?? 1);
    const systemPrompt = String(this.system_prompt ?? "");
    const reasoning = Boolean(this.reasoning ?? false);

    const args: Record<string, unknown> = {
      "model": model,
      "prompt": prompt,
      "max_tokens": maxTokens,
      "temperature": temperature,
      "system_prompt": systemPrompt,
      "reasoning": reasoning,
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "openrouter/router", args);
    return {
      "usage": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["usage"]),
      "error": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["error"]),
      "partial": coerceFalOutputForPropType("bool", (res as Record<string, unknown>)["partial"]),
      "reasoning": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["reasoning"]),
      "output": coerceFalOutputForPropType("str", (res as Record<string, unknown>)["output"]),
    };
  }
}

export class OpenRouterChatCompletions extends FalNode {
  static readonly nodeType = "fal.llm.OpenRouterChatCompletions";
  static readonly title = "Open Router Chat Completions";
  static readonly description = `OpenRouter Chat Completions provides OpenAI-compatible interface for any LLM.
llm, chat, openai-compatible, openrouter, chat-completions`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "openrouter/router/openai/v1/chat/completions",
    unitPrice: 0.01,
    billingUnit: "units",
    currency: "USD",
  };

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "openrouter/router/openai/v1/chat/completions", args);
    return { output: res };
  }
}

export class OpenrouterRouterOpenaiV1Embeddings extends FalNode {
  static readonly nodeType = "fal.llm.OpenrouterRouterOpenaiV1Embeddings";
  static readonly title = "Openrouter Router Openai V1 Embeddings";
  static readonly description = `The OpenRouter Embeddings API with fal, powered by OpenRouter, provides unified access to a wide range of large language models - including GPT, Claude, Gemini, and many others through a single API interface.
llm, language-model, text-generation, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "openrouter/router/openai/v1/embeddings",
    unitPrice: 0.01,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "openrouter/router/openai/v1/embeddings", args);
    return { output: res };
  }
}

export class OpenrouterRouterOpenaiV1Responses extends FalNode {
  static readonly nodeType = "fal.llm.OpenrouterRouterOpenaiV1Responses";
  static readonly title = "Openrouter Router Openai V1 Responses";
  static readonly description = `The OpenRouter Responses API with fal, powered by OpenRouter, provides unified access to a wide range of large language models - including GPT, Claude, Gemini, and many others through a single API interface.
llm, language-model, text-generation, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };
  static readonly falUnitPricing: FalUnitPricing | null = {
    endpointId: "openrouter/router/openai/v1/responses",
    unitPrice: 0.01,
    billingUnit: "compute seconds",
    currency: "USD",
  };

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "openrouter/router/openai/v1/responses", args);
    return { output: res };
  }
}

export const FAL_LLM_NODES: readonly NodeClass[] = [
  BytedanceSeedV2Mini,
  Qwen3Guard,
  OpenRouter,
  OpenRouterChatCompletions,
  OpenrouterRouterOpenaiV1Embeddings,
  OpenrouterRouterOpenaiV1Responses,
] as const;