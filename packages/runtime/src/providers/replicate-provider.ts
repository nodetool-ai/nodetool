import Replicate from "replicate";
import { createLogger } from "@nodetool/config";
import { BaseProvider } from "./base-provider.js";
import type { Chunk } from "@nodetool/protocol";
import type {
  ASRModel,
  EmbeddingModel,
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  LanguageModel,
  Message,
  MessageTextContent,
  ProviderStreamItem,
  ProviderTool,
  TextToImageParams,
  TTSModel,
  VideoModel,
  TextToVideoParams
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.replicate");

interface ReplicateProviderOptions {
  /** Inject a pre-built Replicate client (mainly for testing). */
  client?: Replicate;
  fetchFn?: typeof fetch;
}

/**
 * Provider for Replicate's LLM, image, video, and audio models.
 *
 * Uses the official Replicate TypeScript SDK (`replicate` package).
 * - Chat / LLM:  `replicate.run()` and `replicate.stream()` with SSE
 * - Image / Video / TTS:  `replicate.run()` with file output
 */
export class ReplicateProvider extends BaseProvider {
  static requiredSecrets(): string[] {
    return ["REPLICATE_API_TOKEN"];
  }

  readonly apiKey: string;
  private _client: Replicate;

  constructor(
    secrets: { REPLICATE_API_TOKEN?: string },
    options: ReplicateProviderOptions = {}
  ) {
    super("replicate");

    const apiKey = secrets.REPLICATE_API_TOKEN;
    if (!apiKey) {
      throw new Error("REPLICATE_API_TOKEN is required");
    }

    this.apiKey = apiKey;
    this._client =
      options.client ??
      new Replicate({
        auth: apiKey,
        ...(options.fetchFn ? { fetch: options.fetchFn } : {})
      });
  }

  getContainerEnv(): Record<string, string> {
    return { REPLICATE_API_TOKEN: this.apiKey };
  }

  async hasToolSupport(_model: string): Promise<boolean> {
    // Replicate predictions API does not support OpenAI-style tool calling
    return false;
  }

  // ---------------------------------------------------------------------------
  // Chat completions via Replicate SDK
  // ---------------------------------------------------------------------------

  /**
   * Convert our Message[] into the prompt/system_prompt format
   * that most Replicate LLMs expect.
   */
  private _formatChatInput(
    messages: Message[],
    maxTokens?: number
  ): Record<string, unknown> {
    let systemPrompt = "";
    const parts: string[] = [];

    for (const msg of messages) {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .filter((c): c is MessageTextContent => c.type === "text")
                .map((c) => c.text)
                .join("\n")
            : "";

      if (msg.role === "system") {
        systemPrompt += (systemPrompt ? "\n" : "") + text;
      } else if (msg.role === "user" || msg.role === "assistant") {
        parts.push(text);
      }
    }

    const input: Record<string, unknown> = {
      prompt: parts.join("\n")
    };
    if (systemPrompt) input.system_prompt = systemPrompt;
    if (maxTokens != null) input.max_tokens = maxTokens;
    return input;
  }

  async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    responseFormat?: Record<string, unknown>;
    jsonSchema?: Record<string, unknown>;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  }): Promise<Message> {
    const input = this._formatChatInput(args.messages, args.maxTokens);
    if (args.temperature != null) input.temperature = args.temperature;
    if (args.topP != null) input.top_p = args.topP;

    log.debug("generateMessage", { model: args.model });
    const output = await this._client.run(args.model as `${string}/${string}`, {
      input
    });

    // Replicate LLMs return output as a string, array of token strings,
    // or a ReadableStream/FileOutput.
    let text: string;
    if (typeof output === "string") {
      text = output;
    } else if (Array.isArray(output)) {
      text = output.join("");
    } else {
      text = String(output ?? "");
    }

    return { role: "assistant", content: text };
  }

  async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    responseFormat?: Record<string, unknown>;
    jsonSchema?: Record<string, unknown>;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    audio?: Record<string, unknown>;
  }): AsyncGenerator<ProviderStreamItem> {
    const input = this._formatChatInput(args.messages, args.maxTokens);
    if (args.temperature != null) input.temperature = args.temperature;
    if (args.topP != null) input.top_p = args.topP;

    log.debug("generateMessages (streaming)", { model: args.model });

    const stream = this._client.stream(args.model as `${string}/${string}`, {
      input
    });

    for await (const event of stream) {
      if (event.event === "output") {
        yield {
          type: "chunk",
          content: String(event.data),
          done: false,
          content_type: "text"
        } as Chunk;
      } else if (event.event === "error") {
        throw new Error(`Replicate stream error: ${String(event.data)}`);
      } else if (event.event === "done") {
        yield {
          type: "chunk",
          content: "",
          done: true,
          content_type: "text"
        } as Chunk;
        return;
      }
    }

    // End of stream without explicit done event
    yield {
      type: "chunk",
      content: "",
      done: true,
      content_type: "text"
    } as Chunk;
  }

  // ---------------------------------------------------------------------------
  // Available models
  // ---------------------------------------------------------------------------

  async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return [
      {
        id: "meta/meta-llama-3-8b-instruct",
        name: "Llama 3 8B Instruct",
        provider: "replicate"
      },
      {
        id: "meta/meta-llama-3-70b-instruct",
        name: "Llama 3 70B Instruct",
        provider: "replicate"
      },
      {
        id: "meta/meta-llama-3.1-405b-instruct",
        name: "Llama 3.1 405B Instruct",
        provider: "replicate"
      },
      {
        id: "deepseek-ai/deepseek-r1",
        name: "DeepSeek R1",
        provider: "replicate"
      },
      {
        id: "deepseek-ai/deepseek-v3",
        name: "DeepSeek V3",
        provider: "replicate"
      },
      {
        id: "deepseek-ai/deepseek-v3.1",
        name: "DeepSeek V3.1",
        provider: "replicate"
      },
      {
        id: "google/gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        provider: "replicate"
      },
      {
        id: "google/gemini-3-pro",
        name: "Gemini 3 Pro",
        provider: "replicate"
      },
      {
        id: "google/gemini-3.1-pro",
        name: "Gemini 3.1 Pro",
        provider: "replicate"
      },
      {
        id: "anthropic/claude-3.7-sonnet",
        name: "Claude 3.7 Sonnet",
        provider: "replicate"
      },
      {
        id: "anthropic/claude-4-sonnet",
        name: "Claude 4 Sonnet",
        provider: "replicate"
      },
      {
        id: "anthropic/claude-4.5-sonnet",
        name: "Claude 4.5 Sonnet",
        provider: "replicate"
      },
      {
        id: "anthropic/claude-4.5-haiku",
        name: "Claude 4.5 Haiku",
        provider: "replicate"
      },
      {
        id: "anthropic/claude-opus-4.6",
        name: "Claude Opus 4.6",
        provider: "replicate"
      },
      { id: "openai/gpt-4o", name: "GPT-4o", provider: "replicate" },
      { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "replicate" },
      { id: "openai/gpt-4.1", name: "GPT-4.1", provider: "replicate" },
      {
        id: "openai/gpt-4.1-mini",
        name: "GPT-4.1 Mini",
        provider: "replicate"
      },
      { id: "openai/gpt-5", name: "GPT-5", provider: "replicate" },
      { id: "openai/gpt-5-mini", name: "GPT-5 Mini", provider: "replicate" },
      { id: "openai/gpt-5.2", name: "GPT-5.2", provider: "replicate" },
      { id: "openai/o1", name: "O1", provider: "replicate" },
      { id: "openai/o4-mini", name: "O4 Mini", provider: "replicate" },
      { id: "xai/grok-4", name: "Grok 4", provider: "replicate" },
      {
        id: "qwen/qwen3-235b-a22b-instruct-2507",
        name: "Qwen3 235B",
        provider: "replicate"
      },
      { id: "moonshotai/kimi-k2.5", name: "Kimi K2.5", provider: "replicate" },
      {
        id: "snowflake/snowflake-arctic-instruct",
        name: "Snowflake Arctic Instruct",
        provider: "replicate"
      }
    ];
  }

  async getAvailableImageModels(): Promise<ImageModel[]> {
    return [
      {
        id: "black-forest-labs/flux-schnell",
        name: "FLUX Schnell",
        provider: "replicate",
        supportedTasks: ["text_to_image"]
      },
      {
        id: "black-forest-labs/flux-dev",
        name: "FLUX Dev",
        provider: "replicate",
        supportedTasks: ["text_to_image"]
      },
      {
        id: "black-forest-labs/flux-pro",
        name: "FLUX Pro",
        provider: "replicate",
        supportedTasks: ["text_to_image"]
      },
      {
        id: "black-forest-labs/flux-1.1-pro-ultra",
        name: "FLUX 1.1 Pro Ultra",
        provider: "replicate",
        supportedTasks: ["text_to_image"]
      },
      {
        id: "black-forest-labs/flux-kontext-pro",
        name: "FLUX Kontext Pro",
        provider: "replicate",
        supportedTasks: ["text_to_image", "image_to_image"]
      },
      {
        id: "black-forest-labs/flux-kontext-max",
        name: "FLUX Kontext Max",
        provider: "replicate",
        supportedTasks: ["text_to_image", "image_to_image"]
      },
      {
        id: "stability-ai/sdxl",
        name: "Stable Diffusion XL",
        provider: "replicate",
        supportedTasks: ["text_to_image"]
      },
      {
        id: "stability-ai/stable-diffusion-3.5-large",
        name: "SD 3.5 Large",
        provider: "replicate",
        supportedTasks: ["text_to_image"]
      },
      {
        id: "ideogram-ai/ideogram-v3-turbo",
        name: "Ideogram V3 Turbo",
        provider: "replicate",
        supportedTasks: ["text_to_image"]
      },
      {
        id: "recraft-ai/recraft-v3",
        name: "Recraft V3",
        provider: "replicate",
        supportedTasks: ["text_to_image"]
      },
      {
        id: "google/imagen-4-fast",
        name: "Imagen 4 Fast",
        provider: "replicate",
        supportedTasks: ["text_to_image"]
      },
      {
        id: "bytedance/seedream-4.5",
        name: "Seedream 4.5",
        provider: "replicate",
        supportedTasks: ["text_to_image"]
      },
      {
        id: "openai/gpt-image-1.5",
        name: "GPT Image 1.5",
        provider: "replicate",
        supportedTasks: ["text_to_image", "image_to_image"]
      },
      {
        id: "xai/grok-imagine-image",
        name: "Grok Imagine Image",
        provider: "replicate",
        supportedTasks: ["text_to_image"]
      }
    ];
  }

  async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [
      {
        id: "google/veo-3.1",
        name: "Veo 3.1",
        provider: "replicate",
        supportedTasks: ["text_to_video"]
      },
      {
        id: "google/veo-3",
        name: "Veo 3",
        provider: "replicate",
        supportedTasks: ["text_to_video"]
      },
      {
        id: "runwayml/gen-4.5",
        name: "Runway Gen 4.5",
        provider: "replicate",
        supportedTasks: ["text_to_video", "image_to_video"]
      },
      {
        id: "kwaivgi/kling-v3-video",
        name: "Kling V3",
        provider: "replicate",
        supportedTasks: ["text_to_video", "image_to_video"]
      },
      {
        id: "minimax/hailuo-2.3",
        name: "Hailuo 2.3",
        provider: "replicate",
        supportedTasks: ["text_to_video"]
      },
      {
        id: "luma/ray-2-720p",
        name: "Ray 2 720p",
        provider: "replicate",
        supportedTasks: ["text_to_video", "image_to_video"]
      },
      {
        id: "wan-video/wan-2.5-t2v",
        name: "Wan 2.5 T2V",
        provider: "replicate",
        supportedTasks: ["text_to_video"]
      },
      {
        id: "pixverse/pixverse-v5.6",
        name: "PixVerse V5.6",
        provider: "replicate",
        supportedTasks: ["text_to_video"]
      },
      {
        id: "bytedance/seedance-1-pro",
        name: "Seedance 1 Pro",
        provider: "replicate",
        supportedTasks: ["text_to_video", "image_to_video"]
      },
      {
        id: "openai/sora-2",
        name: "Sora 2",
        provider: "replicate",
        supportedTasks: ["text_to_video"]
      }
    ];
  }

  async getAvailableTTSModels(): Promise<TTSModel[]> {
    return [
      { id: "elevenlabs/v3", name: "ElevenLabs V3", provider: "replicate" },
      {
        id: "minimax/speech-2.8-hd",
        name: "MiniMax Speech 2.8 HD",
        provider: "replicate"
      },
      { id: "jaaari/kokoro-82m", name: "Kokoro 82M", provider: "replicate" },
      {
        id: "resemble-ai/chatterbox-pro",
        name: "Chatterbox Pro",
        provider: "replicate"
      },
      { id: "x-lance/f5-tts", name: "F5 TTS", provider: "replicate" }
    ];
  }

  async getAvailableASRModels(): Promise<ASRModel[]> {
    return [
      {
        id: "openai/gpt-4o-transcribe",
        name: "GPT-4o Transcribe",
        provider: "replicate"
      },
      {
        id: "vaibhavs10/incredibly-fast-whisper",
        name: "Incredibly Fast Whisper",
        provider: "replicate"
      },
      { id: "openai/whisper", name: "Whisper", provider: "replicate" },
      { id: "daanelson/whisperx", name: "WhisperX", provider: "replicate" },
      {
        id: "thomasmol/whisper-diarization",
        name: "Whisper Diarization",
        provider: "replicate"
      }
    ];
  }

  async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return [
      {
        id: "replicate/all-mpnet-base-v2",
        name: "All MPNet Base V2",
        provider: "replicate",
        dimensions: 768
      },
      {
        id: "lucataco/snowflake-arctic-embed-l",
        name: "Snowflake Arctic Embed L",
        provider: "replicate",
        dimensions: 1024
      },
      {
        id: "lucataco/nomic-embed-text-v1",
        name: "Nomic Embed Text V1",
        provider: "replicate",
        dimensions: 768
      },
      {
        id: "nateraw/bge-large-en-v1.5",
        name: "BGE Large EN v1.5",
        provider: "replicate",
        dimensions: 1024
      },
      {
        id: "ibm-granite/granite-embedding-278m-multilingual",
        name: "Granite Embedding 278M Multilingual",
        provider: "replicate",
        dimensions: 768
      },
      {
        id: "beautyyuyanli/multilingual-e5-large",
        name: "Multilingual E5 Large",
        provider: "replicate",
        dimensions: 1024
      },
      {
        id: "zsxkib/jina-clip-v2",
        name: "Jina CLIP V2",
        provider: "replicate",
        dimensions: 1024
      },
      {
        id: "cuuupid/gte-qwen2-7b-instruct",
        name: "GTE Qwen2 7B Instruct",
        provider: "replicate",
        dimensions: 3584
      },
      {
        id: "andreasjansson/clip-features",
        name: "CLIP Features",
        provider: "replicate",
        dimensions: 512
      },
      {
        id: "daanelson/imagebind",
        name: "ImageBind",
        provider: "replicate",
        dimensions: 1024
      }
    ];
  }

  // ---------------------------------------------------------------------------
  // Image / Video / Audio capabilities
  // ---------------------------------------------------------------------------

  private async _fetchOutputBytes(output: unknown): Promise<Uint8Array> {
    // replicate.run() returns FileOutput (ReadableStream) for file models,
    // or a string URL, or an array of URLs/FileOutputs.
    let target: unknown = output;
    if (Array.isArray(output)) {
      target = output[0];
    }

    // FileOutput is a ReadableStream — read it to bytes
    if (target && typeof target === "object" && "getReader" in target) {
      const reader = (target as ReadableStream<Uint8Array>).getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      return result;
    }

    // String URL — fetch the bytes
    if (typeof target === "string") {
      const res = await fetch(target);
      if (!res.ok) throw new Error(`Failed to fetch output: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    }

    throw new Error("Replicate prediction returned no usable output");
  }

  async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt) throw new Error("Prompt is required");

    const input: Record<string, unknown> = { prompt: params.prompt };
    if (params.negativePrompt) input.negative_prompt = params.negativePrompt;
    if (params.width) input.width = params.width;
    if (params.height) input.height = params.height;
    if (params.guidanceScale != null)
      input.guidance_scale = params.guidanceScale;
    if (params.numInferenceSteps != null)
      input.num_inference_steps = params.numInferenceSteps;
    if (params.seed != null) input.seed = params.seed;
    if (params.scheduler) input.scheduler = params.scheduler;

    log.debug("textToImage", { model: params.model.id });
    const output = await this._client.run(
      params.model.id as `${string}/${string}`,
      { input }
    );
    return this._fetchOutputBytes(output);
  }

  async imageToImage(
    image: Uint8Array,
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const base64 = Buffer.from(image).toString("base64");
    const dataUri = `data:image/png;base64,${base64}`;

    const input: Record<string, unknown> = { image: dataUri };
    if (params.prompt) input.prompt = params.prompt;
    if (params.negativePrompt) input.negative_prompt = params.negativePrompt;
    if (params.guidanceScale != null)
      input.guidance_scale = params.guidanceScale;
    if (params.numInferenceSteps != null)
      input.num_inference_steps = params.numInferenceSteps;
    if (params.strength != null) input.strength = params.strength;
    if (params.seed != null) input.seed = params.seed;

    log.debug("imageToImage", { model: params.model.id });
    const output = await this._client.run(
      params.model.id as `${string}/${string}`,
      { input }
    );
    return this._fetchOutputBytes(output);
  }

  async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt) throw new Error("Prompt is required");

    const input: Record<string, unknown> = { prompt: params.prompt };
    if (params.negativePrompt) input.negative_prompt = params.negativePrompt;
    if (params.aspectRatio) input.aspect_ratio = params.aspectRatio;
    if (params.numFrames) input.num_frames = params.numFrames;
    if (params.guidanceScale != null)
      input.guidance_scale = params.guidanceScale;
    if (params.seed != null) input.seed = params.seed;

    log.debug("textToVideo", { model: params.model.id });
    const output = await this._client.run(
      params.model.id as `${string}/${string}`,
      { input }
    );
    return this._fetchOutputBytes(output);
  }

  async imageToVideo(
    image: Uint8Array,
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    const base64 = Buffer.from(image).toString("base64");
    const dataUri = `data:image/png;base64,${base64}`;

    const input: Record<string, unknown> = { image: dataUri };
    if (params.prompt) input.prompt = params.prompt;
    if (params.negativePrompt) input.negative_prompt = params.negativePrompt;
    if (params.aspectRatio) input.aspect_ratio = params.aspectRatio;
    if (params.numFrames) input.num_frames = params.numFrames;
    if (params.guidanceScale != null)
      input.guidance_scale = params.guidanceScale;
    if (params.seed != null) input.seed = params.seed;

    log.debug("imageToVideo", { model: params.model.id });
    const output = await this._client.run(
      params.model.id as `${string}/${string}`,
      { input }
    );
    return this._fetchOutputBytes(output);
  }

  async *textToSpeech(args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
  }): AsyncGenerator<{ samples: Int16Array }> {
    const input: Record<string, unknown> = { text: args.text };
    if (args.voice) input.voice = args.voice;
    if (args.speed != null) input.speed = args.speed;

    log.debug("textToSpeech", { model: args.model });
    const output = await this._client.run(args.model as `${string}/${string}`, {
      input
    });
    const bytes = await this._fetchOutputBytes(output);

    // Convert to Int16Array (assume raw PCM or WAV)
    yield {
      samples: new Int16Array(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength / 2
      )
    };
  }
}
