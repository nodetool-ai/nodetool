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

export class OpenRouter extends FalNode {
  static readonly nodeType = "fal.llm.OpenRouter";
  static readonly title = "Open Router";
  static readonly description = `OpenRouter provides unified access to any LLM (Large Language Model) through a single API.
llm, chat, openrouter, multimodel, language-model`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = {
    usage: "str",
    error: "str",
    partial: "bool",
    reasoning: "str",
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    description: "Prompt to be used for the chat completion"
  })
  declare prompt: any;

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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const model = String(this.model ?? "");
    const maxTokens = String(this.max_tokens ?? "");
    const temperature = Number(this.temperature ?? 1);
    const reasoning = Boolean(this.reasoning ?? false);
    const systemPrompt = String(this.system_prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt,
      model: model,
      max_tokens: maxTokens,
      temperature: temperature,
      reasoning: reasoning,
      system_prompt: systemPrompt
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "openrouter/router", args);
    return res as Record<string, unknown>;
  }
}

export class OpenRouterChatCompletions extends FalNode {
  static readonly nodeType = "fal.llm.OpenRouterChatCompletions";
  static readonly title = "Open Router Chat Completions";
  static readonly description = `OpenRouter Chat Completions provides OpenAI-compatible interface for any LLM.
llm, chat, openai-compatible, openrouter, chat-completions`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "openrouter/router/openai/v1/chat/completions",
      args
    );
    return { output: res };
  }
}

export class Qwen3Guard extends FalNode {
  static readonly nodeType = "fal.llm.Qwen3Guard";
  static readonly title = "Qwen3 Guard";
  static readonly description = `Qwen 3 Guard provides content safety and moderation using Qwen's LLM.
llm, safety, moderation, qwen, guard`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { categories: "list[str]", label: "enum" };

  @prop({
    type: "str",
    default: "",
    description: "The input text to be classified"
  })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");

    const args: Record<string, unknown> = {
      prompt: prompt
    };
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/qwen-3-guard", args);
    return res as Record<string, unknown>;
  }
}

export class OpenrouterRouterOpenaiV1Responses extends FalNode {
  static readonly nodeType = "fal.llm.OpenrouterRouterOpenaiV1Responses";
  static readonly title = "Openrouter Router Openai V1 Responses";
  static readonly description = `The OpenRouter Responses API with fal, powered by OpenRouter, provides unified access to a wide range of large language models - including GPT, Claude, Gemini, and many others through a single API interface.
llm, language-model, text-generation, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "dict" };

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "openrouter/router/openai/v1/responses",
      args
    );
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

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const args: Record<string, unknown> = {};
    removeNulls(args);

    const res = await falSubmit(
      apiKey,
      "openrouter/router/openai/v1/embeddings",
      args
    );
    return { output: res };
  }
}

export class VideoPromptGenerator extends FalNode {
  static readonly nodeType = "fal.llm.VideoPromptGenerator";
  static readonly title = "Video Prompt Generator";
  static readonly description = `Generate video prompts using a variety of techniques including camera direction, style, pacing, special effects and more.
llm, language-model, text-generation, ai`;
  static readonly requiredSettings = ["FAL_API_KEY"];
  static readonly outputTypes = { output: "str" };

  @prop({
    type: "str",
    default: "",
    description: "Custom technical elements (optional)"
  })
  declare custom_elements: any;

  @prop({
    type: "enum",
    default: "Simple",
    values: [
      "Minimalist",
      "Simple",
      "Detailed",
      "Descriptive",
      "Dynamic",
      "Cinematic",
      "Documentary",
      "Animation",
      "Action",
      "Experimental"
    ],
    description: "Style of the video prompt"
  })
  declare style: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "Zoom in",
      "Zoom out",
      "Pan left",
      "Pan right",
      "Tilt up",
      "Tilt down",
      "Orbital rotation",
      "Push in",
      "Pull out",
      "Track forward",
      "Track backward",
      "Spiral in",
      "Spiral out",
      "Arc movement",
      "Diagonal traverse",
      "Vertical rise",
      "Vertical descent"
    ],
    description: "Camera direction"
  })
  declare camera_direction: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "Slow burn",
      "Rhythmic pulse",
      "Frantic energy",
      "Ebb and flow",
      "Hypnotic drift",
      "Time-lapse rush",
      "Stop-motion staccato",
      "Gradual build",
      "Quick cut rhythm",
      "Long take meditation",
      "Jump cut energy",
      "Match cut flow",
      "Cross-dissolve dreamscape",
      "Parallel action",
      "Slow motion impact",
      "Ramping dynamics",
      "Montage tempo",
      "Continuous flow",
      "Episodic breaks"
    ],
    description: "Pacing rhythm"
  })
  declare pacing: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "Practical effects",
      "CGI enhancement",
      "Analog glitches",
      "Light painting",
      "Projection mapping",
      "Nanosecond exposures",
      "Double exposure",
      "Smoke diffusion",
      "Lens flare artistry",
      "Particle systems",
      "Holographic overlay",
      "Chromatic aberration",
      "Digital distortion",
      "Wire removal",
      "Motion capture",
      "Miniature integration",
      "Weather simulation",
      "Color grading",
      "Mixed media composite",
      "Neural style transfer"
    ],
    description: "Special effects approach"
  })
  declare special_effects: any;

  @prop({
    type: "image",
    default: "",
    description:
      "URL of an image to analyze and incorporate into the video prompt (optional)"
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "google/gemini-2.0-flash-001",
    values: [
      "anthropic/claude-3.5-sonnet",
      "anthropic/claude-3-5-haiku",
      "anthropic/claude-3-haiku",
      "google/gemini-2.5-flash-lite",
      "google/gemini-2.0-flash-001",
      "meta-llama/llama-3.2-1b-instruct",
      "meta-llama/llama-3.2-3b-instruct",
      "meta-llama/llama-3.1-8b-instruct",
      "meta-llama/llama-3.1-70b-instruct",
      "openai/gpt-4o-mini",
      "openai/gpt-4o",
      "deepseek/deepseek-r1"
    ],
    description: "Model to use"
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "Medium",
    values: ["Short", "Medium", "Long"],
    description: "Length of the prompt"
  })
  declare prompt_length: any;

  @prop({
    type: "str",
    default: "",
    description: "Core concept or thematic input for the video prompt"
  })
  declare input_concept: any;

  @prop({
    type: "enum",
    default: "None",
    values: [
      "None",
      "Steadicam flow",
      "Drone aerials",
      "Handheld urgency",
      "Crane elegance",
      "Dolly precision",
      "VR 360",
      "Multi-angle rig",
      "Static tripod",
      "Gimbal smoothness",
      "Slider motion",
      "Jib sweep",
      "POV immersion",
      "Time-slice array",
      "Macro extreme",
      "Tilt-shift miniature",
      "Snorricam character",
      "Whip pan dynamics",
      "Dutch angle tension",
      "Underwater housing",
      "Periscope lens"
    ],
    description: "Camera movement style"
  })
  declare camera_style: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getFalApiKey(this._secrets);
    const customElements = String(this.custom_elements ?? "");
    const style = String(this.style ?? "Simple");
    const cameraDirection = String(this.camera_direction ?? "None");
    const pacing = String(this.pacing ?? "None");
    const specialEffects = String(this.special_effects ?? "None");
    const model = String(this.model ?? "google/gemini-2.0-flash-001");
    const promptLength = String(this.prompt_length ?? "Medium");
    const inputConcept = String(this.input_concept ?? "");
    const cameraStyle = String(this.camera_style ?? "None");

    const args: Record<string, unknown> = {
      custom_elements: customElements,
      style: style,
      camera_direction: cameraDirection,
      pacing: pacing,
      special_effects: specialEffects,
      model: model,
      prompt_length: promptLength,
      input_concept: inputConcept,
      camera_style: cameraStyle
    };

    const imageRef = this.image as Record<string, unknown> | undefined;
    if (isRefSet(imageRef)) {
      const imageUrl =
        (await imageToDataUrl(imageRef!)) ??
        (await assetToFalUrl(apiKey, imageRef!));
      if (imageUrl) args["image_url"] = imageUrl;
    }
    removeNulls(args);

    const res = await falSubmit(apiKey, "fal-ai/video-prompt-generator", args);
    return { output: (res as any).output ?? "" };
  }
}

export const FAL_LLM_NODES: readonly NodeClass[] = [
  OpenRouter,
  OpenRouterChatCompletions,
  Qwen3Guard,
  OpenrouterRouterOpenaiV1Responses,
  OpenrouterRouterOpenaiV1Embeddings,
  VideoPromptGenerator
] as const;
