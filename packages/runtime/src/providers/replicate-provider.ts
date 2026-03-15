import OpenAI from "openai";
import { createLogger } from "@nodetool/config";
import { OpenAIProvider } from "./openai-provider.js";
import type {
  ImageModel,
  LanguageModel,
  TextToImageParams,
  TTSModel,
  VideoModel,
  TextToVideoParams,
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.replicate");

interface ReplicateProviderOptions {
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;
}

/**
 * Replicate prediction status response.
 */
interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: string | null;
  urls?: { get?: string; stream?: string };
}

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

/**
 * Provider for Replicate's LLM, image, video, and audio models.
 *
 * For chat completions, Replicate exposes an OpenAI-compatible endpoint,
 * so we extend OpenAIProvider and point the OpenAI SDK at Replicate's base URL.
 *
 * For image/video generation, we use Replicate's predictions REST API directly.
 */
export class ReplicateProvider extends OpenAIProvider {
  static override requiredSecrets(): string[] {
    return ["REPLICATE_API_TOKEN"];
  }

  private _replicateFetch: typeof fetch;

  constructor(
    secrets: { REPLICATE_API_TOKEN?: string },
    options: ReplicateProviderOptions = {}
  ) {
    const apiKey = secrets.REPLICATE_API_TOKEN;
    if (!apiKey) {
      throw new Error("REPLICATE_API_TOKEN is required");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      { OPENAI_API_KEY: apiKey },
      {
        client: options.client,
        clientFactory:
          options.clientFactory ??
          ((key) =>
            new OpenAI({
              apiKey: key,
              baseURL: `${REPLICATE_API_BASE}/openai/v1`,
            })),
        fetchFn,
      }
    );

    (this as { provider: string }).provider = "replicate";
    this._replicateFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { REPLICATE_API_TOKEN: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  // ---------------------------------------------------------------------------
  // Available models
  // ---------------------------------------------------------------------------

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return [
      { id: "meta/meta-llama-3-8b-instruct", name: "Llama 3 8B Instruct", provider: "replicate" },
      { id: "meta/meta-llama-3-70b-instruct", name: "Llama 3 70B Instruct", provider: "replicate" },
      { id: "meta/meta-llama-3.1-405b-instruct", name: "Llama 3.1 405B Instruct", provider: "replicate" },
      { id: "deepseek-ai/deepseek-r1", name: "DeepSeek R1", provider: "replicate" },
      { id: "deepseek-ai/deepseek-v3", name: "DeepSeek V3", provider: "replicate" },
      { id: "deepseek-ai/deepseek-v3.1", name: "DeepSeek V3.1", provider: "replicate" },
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "replicate" },
      { id: "google/gemini-3-pro", name: "Gemini 3 Pro", provider: "replicate" },
      { id: "google/gemini-3.1-pro", name: "Gemini 3.1 Pro", provider: "replicate" },
      { id: "anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet", provider: "replicate" },
      { id: "anthropic/claude-4-sonnet", name: "Claude 4 Sonnet", provider: "replicate" },
      { id: "anthropic/claude-4.5-sonnet", name: "Claude 4.5 Sonnet", provider: "replicate" },
      { id: "anthropic/claude-4.5-haiku", name: "Claude 4.5 Haiku", provider: "replicate" },
      { id: "anthropic/claude-opus-4.6", name: "Claude Opus 4.6", provider: "replicate" },
      { id: "openai/gpt-4o", name: "GPT-4o", provider: "replicate" },
      { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "replicate" },
      { id: "openai/gpt-4.1", name: "GPT-4.1", provider: "replicate" },
      { id: "openai/gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "replicate" },
      { id: "openai/gpt-5", name: "GPT-5", provider: "replicate" },
      { id: "openai/gpt-5-mini", name: "GPT-5 Mini", provider: "replicate" },
      { id: "openai/gpt-5.2", name: "GPT-5.2", provider: "replicate" },
      { id: "openai/o1", name: "O1", provider: "replicate" },
      { id: "openai/o4-mini", name: "O4 Mini", provider: "replicate" },
      { id: "xai/grok-4", name: "Grok 4", provider: "replicate" },
      { id: "qwen/qwen3-235b-a22b-instruct-2507", name: "Qwen3 235B", provider: "replicate" },
      { id: "moonshotai/kimi-k2.5", name: "Kimi K2.5", provider: "replicate" },
      { id: "snowflake/snowflake-arctic-instruct", name: "Snowflake Arctic Instruct", provider: "replicate" },
    ];
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return [
      { id: "black-forest-labs/flux-schnell", name: "FLUX Schnell", provider: "replicate", supportedTasks: ["text_to_image"] },
      { id: "black-forest-labs/flux-dev", name: "FLUX Dev", provider: "replicate", supportedTasks: ["text_to_image"] },
      { id: "black-forest-labs/flux-pro", name: "FLUX Pro", provider: "replicate", supportedTasks: ["text_to_image"] },
      { id: "black-forest-labs/flux-1.1-pro-ultra", name: "FLUX 1.1 Pro Ultra", provider: "replicate", supportedTasks: ["text_to_image"] },
      { id: "black-forest-labs/flux-kontext-pro", name: "FLUX Kontext Pro", provider: "replicate", supportedTasks: ["text_to_image", "image_to_image"] },
      { id: "black-forest-labs/flux-kontext-max", name: "FLUX Kontext Max", provider: "replicate", supportedTasks: ["text_to_image", "image_to_image"] },
      { id: "stability-ai/sdxl", name: "Stable Diffusion XL", provider: "replicate", supportedTasks: ["text_to_image"] },
      { id: "stability-ai/stable-diffusion-3.5-large", name: "SD 3.5 Large", provider: "replicate", supportedTasks: ["text_to_image"] },
      { id: "ideogram-ai/ideogram-v3-turbo", name: "Ideogram V3 Turbo", provider: "replicate", supportedTasks: ["text_to_image"] },
      { id: "recraft-ai/recraft-v3", name: "Recraft V3", provider: "replicate", supportedTasks: ["text_to_image"] },
      { id: "google/imagen-4-fast", name: "Imagen 4 Fast", provider: "replicate", supportedTasks: ["text_to_image"] },
      { id: "bytedance/seedream-4.5", name: "Seedream 4.5", provider: "replicate", supportedTasks: ["text_to_image"] },
      { id: "openai/gpt-image-1.5", name: "GPT Image 1.5", provider: "replicate", supportedTasks: ["text_to_image", "image_to_image"] },
      { id: "xai/grok-imagine-image", name: "Grok Imagine Image", provider: "replicate", supportedTasks: ["text_to_image"] },
    ];
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [
      { id: "google/veo-3.1", name: "Veo 3.1", provider: "replicate", supportedTasks: ["text_to_video"] },
      { id: "google/veo-3", name: "Veo 3", provider: "replicate", supportedTasks: ["text_to_video"] },
      { id: "runwayml/gen-4.5", name: "Runway Gen 4.5", provider: "replicate", supportedTasks: ["text_to_video", "image_to_video"] },
      { id: "kwaivgi/kling-v3-video", name: "Kling V3", provider: "replicate", supportedTasks: ["text_to_video", "image_to_video"] },
      { id: "minimax/hailuo-2.3", name: "Hailuo 2.3", provider: "replicate", supportedTasks: ["text_to_video"] },
      { id: "luma/ray-2-720p", name: "Ray 2 720p", provider: "replicate", supportedTasks: ["text_to_video", "image_to_video"] },
      { id: "wan-video/wan-2.5-t2v", name: "Wan 2.5 T2V", provider: "replicate", supportedTasks: ["text_to_video"] },
      { id: "pixverse/pixverse-v5.6", name: "PixVerse V5.6", provider: "replicate", supportedTasks: ["text_to_video"] },
      { id: "bytedance/seedance-1-pro", name: "Seedance 1 Pro", provider: "replicate", supportedTasks: ["text_to_video", "image_to_video"] },
      { id: "openai/sora-2", name: "Sora 2", provider: "replicate", supportedTasks: ["text_to_video"] },
    ];
  }

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return [
      { id: "elevenlabs/v3", name: "ElevenLabs V3", provider: "replicate" },
      { id: "minimax/speech-2.8-hd", name: "MiniMax Speech 2.8 HD", provider: "replicate" },
      { id: "jaaari/kokoro-82m", name: "Kokoro 82M", provider: "replicate" },
      { id: "resemble-ai/chatterbox-pro", name: "Chatterbox Pro", provider: "replicate" },
      { id: "x-lance/f5-tts", name: "F5 TTS", provider: "replicate" },
    ];
  }

  // ---------------------------------------------------------------------------
  // Replicate prediction helper
  // ---------------------------------------------------------------------------

  private async _runPrediction(
    modelId: string,
    input: Record<string, unknown>,
    timeoutMs = 5 * 60 * 1000
  ): Promise<unknown> {
    const createResponse = await this._replicateFetch(
      `${REPLICATE_API_BASE}/models/${modelId}/predictions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({ input }),
      }
    );

    if (!createResponse.ok) {
      const errorBody = await createResponse.text();
      throw new Error(
        `Replicate prediction failed (${createResponse.status}): ${errorBody}`
      );
    }

    let prediction = (await createResponse.json()) as ReplicatePrediction;

    const intervalMs = 2000;
    const start = Date.now();

    while (
      prediction.status === "starting" ||
      prediction.status === "processing"
    ) {
      if (Date.now() - start > timeoutMs) {
        throw new Error("Replicate prediction timed out");
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));

      const pollUrl =
        prediction.urls?.get ??
        `${REPLICATE_API_BASE}/predictions/${prediction.id}`;

      const pollResponse = await this._replicateFetch(pollUrl, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!pollResponse.ok) {
        throw new Error(`Replicate poll failed (${pollResponse.status})`);
      }
      prediction = (await pollResponse.json()) as ReplicatePrediction;
    }

    if (prediction.status !== "succeeded") {
      throw new Error(
        prediction.error ?? `Prediction ended with status '${prediction.status}'`
      );
    }

    return prediction.output;
  }

  private async _fetchOutputBytes(output: unknown): Promise<Uint8Array> {
    let url: string | null = null;
    if (typeof output === "string") {
      url = output;
    } else if (Array.isArray(output) && typeof output[0] === "string") {
      url = output[0];
    }
    if (!url) {
      throw new Error("Replicate prediction returned no output URL");
    }
    const res = await this._replicateFetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch output: ${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt) throw new Error("Prompt is required");

    const input: Record<string, unknown> = { prompt: params.prompt };
    if (params.negativePrompt) input.negative_prompt = params.negativePrompt;
    if (params.width) input.width = params.width;
    if (params.height) input.height = params.height;
    if (params.guidanceScale != null) input.guidance_scale = params.guidanceScale;
    if (params.numInferenceSteps != null) input.num_inference_steps = params.numInferenceSteps;
    if (params.seed != null) input.seed = params.seed;
    if (params.scheduler) input.scheduler = params.scheduler;

    log.debug("textToImage", { model: params.model.id });
    const output = await this._runPrediction(params.model.id, input);
    return this._fetchOutputBytes(output);
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt) throw new Error("Prompt is required");

    const input: Record<string, unknown> = { prompt: params.prompt };
    if (params.negativePrompt) input.negative_prompt = params.negativePrompt;
    if (params.aspectRatio) input.aspect_ratio = params.aspectRatio;
    if (params.numFrames) input.num_frames = params.numFrames;
    if (params.guidanceScale != null) input.guidance_scale = params.guidanceScale;
    if (params.seed != null) input.seed = params.seed;

    log.debug("textToVideo", { model: params.model.id });
    const output = await this._runPrediction(params.model.id, input, 10 * 60 * 1000);
    return this._fetchOutputBytes(output);
  }

  override async *textToSpeech(args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
  }): AsyncGenerator<{ samples: Int16Array }> {
    const input: Record<string, unknown> = { text: args.text };
    if (args.voice) input.voice = args.voice;
    if (args.speed != null) input.speed = args.speed;

    log.debug("textToSpeech", { model: args.model });
    const output = await this._runPrediction(args.model, input);
    const bytes = await this._fetchOutputBytes(output);

    // Convert to Int16Array (assume raw PCM or WAV)
    yield { samples: new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2) };
  }
}
