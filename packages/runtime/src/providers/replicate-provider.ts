import Replicate from "replicate";
import { createLogger } from "@nodetool-ai/config";
import { isObjectLike, isString } from "../type-predicates.js";
import { BaseProvider } from "./base-provider.js";
import { safeFetch } from "./safe-url.js";
import { sniffAudioMime } from "./audio-mime.js";
import type { Chunk } from "@nodetool-ai/protocol";
import type {
  ASRModel,
  EmbeddingModel,
  EncodedAudioResult,
  ImageModel,
  ImageToImageParams,
  InpaintingParams,
  ImageToVideoParams,
  LanguageModel,
  Message,
  MessageTextContent,
  MusicModel,
  ProviderStreamItem,
  ProviderTool,
  TextToImageParams,
  TextToMusicParams,
  TTSModel,
  VideoModel,
  TextToVideoParams,
  UpscaleImageParams,
  RemoveBackgroundParams,
  RelightImageParams,
  VectorizeImageParams,
  VideoToVideoParams,
  LipSyncParams
} from "./types.js";
import {
  getModelImageInputs,
  getModelInputNames,
  loadImageModels,
  loadMusicModels,
  loadVideoModels,
  selectMaskImageInput,
  selectPrimaryImageInput
} from "./manifest-models.js";

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
    const replicateOptions: ConstructorParameters<typeof Replicate>[0] = {
      auth: apiKey
    };
    if (options.fetchFn) {
      replicateOptions.fetch = options.fetchFn;
    }
    this._client = options.client ?? new Replicate(replicateOptions);
  }

  getContainerEnv() {
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
  ) {
    let systemPrompt = "";
    const parts: string[] = [];

    for (const msg of messages) {
      const text =
        isString(msg.content)
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
    if (isString(output)) {
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
      {
        id: "anthropic/claude-opus-4.7",
        name: "Claude Opus 4.7",
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
      {
        id: "openai/gpt-4.1-nano",
        name: "GPT-4.1 Nano",
        provider: "replicate"
      },
      { id: "openai/gpt-5", name: "GPT-5", provider: "replicate" },
      { id: "openai/gpt-5-mini", name: "GPT-5 Mini", provider: "replicate" },
      { id: "openai/gpt-5-nano", name: "GPT-5 Nano", provider: "replicate" },
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
      { id: "moonshotai/kimi-k2.6", name: "Kimi K2.6", provider: "replicate" },
      {
        id: "ibm-granite/granite-4.1-8b",
        name: "Granite 4.1 8B",
        provider: "replicate"
      },
      {
        id: "snowflake/snowflake-arctic-instruct",
        name: "Snowflake Arctic Instruct",
        provider: "replicate"
      },
      {
        id: "anthropic/claude-sonnet-5",
        name: "Claude Sonnet 5",
        provider: "replicate"
      },
      {
        id: "anthropic/claude-sonnet-4.6",
        name: "Claude Sonnet 4.6",
        provider: "replicate"
      },
      {
        id: "anthropic/claude-fable-5",
        name: "Claude Fable 5",
        provider: "replicate"
      },
      { id: "openai/gpt-5.4", name: "GPT-5.4", provider: "replicate" },
      {
        id: "openai/gpt-5.6-sol",
        name: "GPT-5.6 Sol",
        provider: "replicate"
      },
      {
        id: "openai/gpt-5.6-terra",
        name: "GPT-5.6 Terra",
        provider: "replicate"
      },
      {
        id: "openai/gpt-5.6-luna",
        name: "GPT-5.6 Luna",
        provider: "replicate"
      },
      {
        id: "google/gemini-3.5-flash",
        name: "Gemini 3.5 Flash",
        provider: "replicate"
      },
      {
        id: "qwen/qwen3-7-plus",
        name: "Qwen3.7 Plus",
        provider: "replicate"
      },
      {
        id: "ibm-granite/granite-vision-4.1-4b",
        name: "Granite Vision 4.1 4B",
        provider: "replicate"
      },
      {
        id: "anthropic/claude-3.5-haiku",
        name: "Claude 3.5 Haiku",
        provider: "replicate"
      },
      { id: "openai/gpt-5.1", name: "GPT-5.1", provider: "replicate" },
      { id: "openai/gpt-5-pro", name: "GPT-5 Pro", provider: "replicate" },
      { id: "openai/o1-mini", name: "O1 Mini", provider: "replicate" },
      {
        id: "openai/gpt-oss-120b",
        name: "GPT OSS 120B",
        provider: "replicate"
      },
      { id: "openai/gpt-oss-20b", name: "GPT OSS 20B", provider: "replicate" },
      {
        id: "meta/llama-4-maverick-instruct",
        name: "Llama 4 Maverick Instruct",
        provider: "replicate"
      },
      {
        id: "meta/llama-4-scout-instruct",
        name: "Llama 4 Scout Instruct",
        provider: "replicate"
      },
      {
        id: "ibm-granite/granite-3.2-8b-instruct",
        name: "Granite 3.2 8B Instruct",
        provider: "replicate"
      },
      {
        id: "ibm-granite/granite-3.3-8b-instruct",
        name: "Granite 3.3 8B Instruct",
        provider: "replicate"
      },
      {
        id: "ibm-granite/granite-vision-3.3-2b",
        name: "Granite Vision 3.3 2B",
        provider: "replicate"
      },
      {
        id: "lucataco/qwen2.5-omni-7b",
        name: "Qwen2.5 Omni 7B",
        provider: "replicate"
      },
      {
        id: "google/gemini-3-flash",
        name: "Gemini 3 Flash",
        provider: "replicate"
      },
      {
        id: "openai/gpt-5-structured",
        name: "GPT-5 Structured",
        provider: "replicate"
      },
      {
        id: "moonshotai/kimi-k2-thinking",
        name: "Kimi K2 Thinking",
        provider: "replicate"
      },
      {
        id: "ibm-granite/granite-4.0-h-small",
        name: "Granite 4.0 H Small",
        provider: "replicate"
      },
      {
        id: "nvidia/nemotron-3-nano-30b-a3b",
        name: "Nemotron 3 Nano 30B A3B",
        provider: "replicate"
      },
      {
        id: "nvidia/nemotron-nano-v2-12b-vl",
        name: "Nemotron Nano V2 12B VL",
        provider: "replicate"
      }
    ];
  }

  async getAvailableImageModels(): Promise<ImageModel[]> {
    return loadImageModels(
      "@nodetool-ai/replicate-nodes",
      "replicate-manifest.json",
      "replicate"
    );
  }

  async getAvailableVideoModels(): Promise<VideoModel[]> {
    return loadVideoModels(
      "@nodetool-ai/replicate-nodes",
      "replicate-manifest.json",
      "replicate"
    );
  }

  async getAvailableTTSModels(): Promise<TTSModel[]> {
    return [
      { id: "elevenlabs/v3", name: "ElevenLabs V3", provider: "replicate" },
      {
        id: "minimax/speech-2.8-hd",
        name: "MiniMax Speech 2.8 HD",
        provider: "replicate"
      },
      {
        id: "minimax/speech-2.8-turbo",
        name: "MiniMax Speech 2.8 Turbo",
        provider: "replicate"
      },
      {
        id: "google/gemini-3.1-flash-tts",
        name: "Gemini 3.1 Flash TTS",
        provider: "replicate"
      },
      { id: "qwen/qwen3-tts", name: "Qwen3 TTS", provider: "replicate" },
      {
        id: "inworld/tts-1.5-max",
        name: "Inworld TTS 1.5 Max",
        provider: "replicate"
      },
      {
        id: "inworld/tts-1.5-mini",
        name: "Inworld TTS 1.5 Mini",
        provider: "replicate"
      },
      {
        id: "inworld/realtime-tts-2",
        name: "Inworld Realtime TTS 2",
        provider: "replicate"
      },
      {
        id: "xai/grok-text-to-speech",
        name: "Grok Text To Speech",
        provider: "replicate"
      },
      { id: "jaaari/kokoro-82m", name: "Kokoro 82M", provider: "replicate" },
      {
        id: "resemble-ai/chatterbox-pro",
        name: "Chatterbox Pro",
        provider: "replicate"
      },
      {
        id: "resemble-ai/chatterbox-turbo",
        name: "Chatterbox Turbo",
        provider: "replicate"
      },
      {
        id: "resemble-ai/chatterbox-multilingual",
        name: "Chatterbox Multilingual",
        provider: "replicate"
      },
      { id: "x-lance/f5-tts", name: "F5 TTS", provider: "replicate" },
      {
        id: "inworld/realtime-tts-1.5-max",
        name: "Inworld Realtime TTS 1.5 Max",
        provider: "replicate"
      },
      {
        id: "inworld/realtime-tts-1.5-mini",
        name: "Inworld Realtime TTS 1.5 Mini",
        provider: "replicate"
      },
      {
        id: "elevenlabs/v2-multilingual",
        name: "ElevenLabs V2 Multilingual",
        provider: "replicate"
      },
      {
        id: "elevenlabs/turbo-v2.5",
        name: "ElevenLabs Turbo V2.5",
        provider: "replicate"
      },
      {
        id: "elevenlabs/flash-v2.5",
        name: "ElevenLabs Flash V2.5",
        provider: "replicate"
      },
      {
        id: "minimax/speech-2.6-hd",
        name: "MiniMax Speech 2.6 HD",
        provider: "replicate"
      },
      {
        id: "minimax/speech-2.6-turbo",
        name: "MiniMax Speech 2.6 Turbo",
        provider: "replicate"
      },
      {
        id: "resemble-ai/chatterbox",
        name: "Chatterbox",
        provider: "replicate"
      }
    ];
  }

  async getAvailableMusicModels(): Promise<MusicModel[]> {
    return loadMusicModels(
      "@nodetool-ai/replicate-nodes",
      "replicate-manifest.json",
      "replicate"
    );
  }

  async getAvailableASRModels(): Promise<ASRModel[]> {
    return [
      {
        id: "elevenlabs/scribe-v2",
        name: "ElevenLabs Scribe V2",
        provider: "replicate"
      },
      {
        id: "openai/gpt-4o-transcribe",
        name: "GPT-4o Transcribe",
        provider: "replicate"
      },
      {
        id: "openai/gpt-4o-mini-transcribe",
        name: "GPT-4o Mini Transcribe",
        provider: "replicate"
      },
      {
        id: "xai/grok-speech-to-text",
        name: "Grok Speech To Text",
        provider: "replicate"
      },
      {
        id: "nvidia/parakeet-rnnt-1.1b",
        name: "Parakeet RNNT 1.1B",
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
      },
      {
        id: "rafaelgalle/whisper-diarization-advanced",
        name: "Whisper Diarization Advanced",
        provider: "replicate"
      },
      {
        id: "ibm-granite/granite-speech-3.3-8b",
        name: "Granite Speech 3.3 8B",
        provider: "replicate"
      },
      {
        id: "ibm-granite/granite-speech-4.1-2b",
        name: "Granite Speech 4.1 2B",
        provider: "replicate"
      },
      {
        id: "nvidia/canary-qwen-2.5b",
        name: "Canary Qwen 2.5B",
        provider: "replicate"
      },
      {
        id: "victor-upmeet/whisperx",
        name: "WhisperX Large V3",
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
        id: "ibm-granite/granite-embedding-small-english-r2",
        name: "Granite Embedding Small English R2",
        provider: "replicate",
        dimensions: 384
      },
      {
        id: "adirik/e5-mistral-7b-instruct",
        name: "E5 Mistral 7B Instruct",
        provider: "replicate",
        dimensions: 4096
      },
      {
        id: "mark3labs/embeddings-gte-base",
        name: "GTE Base",
        provider: "replicate",
        dimensions: 768
      },
      {
        id: "center-for-curriculum-redesign/bge_1-5_query_embeddings",
        name: "BGE 1.5 Query Embeddings",
        provider: "replicate",
        dimensions: 1024
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
      },
      {
        id: "openai/clip",
        name: "CLIP ViT-L/14",
        provider: "replicate",
        dimensions: 768
      },
      {
        id: "krthr/clip-embeddings",
        name: "CLIP Embeddings",
        provider: "replicate",
        dimensions: 768
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
    if (isObjectLike(target) && "getReader" in target) {
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
    if (isString(target)) {
      const res = await safeFetch(target);
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
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const input: Record<string, unknown> = this.imageInput(
      params.model.id,
      images
    );
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

  override async inpaint(
    images: Uint8Array[],
    params: InpaintingParams
  ): Promise<Uint8Array> {
    const input: Record<string, unknown> = this.imageInput(
      params.model.id,
      images
    );
    if (params.prompt) input.prompt = params.prompt;
    if (params.negativePrompt) input.negative_prompt = params.negativePrompt;
    if (params.guidanceScale != null)
      input.guidance_scale = params.guidanceScale;
    if (params.numInferenceSteps != null)
      input.num_inference_steps = params.numInferenceSteps;
    if (params.strength != null) input.strength = params.strength;
    if (params.seed != null) input.seed = params.seed;

    if (params.mask && params.mask.length > 0) {
      const maskUri = this.dataUri(params.mask, "image/png");
      const maskField = selectMaskImageInput(
        getModelImageInputs(
          "@nodetool-ai/replicate-nodes",
          "replicate-manifest.json",
          params.model.id
        )
      );
      const fieldName = maskField?.apiName ?? "mask_url";
      input[fieldName] = maskField?.isList ? [maskUri] : maskUri;
    }

    log.debug("inpaint", { model: params.model.id });
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
    images: Uint8Array[],
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    const input: Record<string, unknown> = this.imageInput(
      params.model.id,
      images
    );
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

  private dataUri(bytes: Uint8Array, mimeType: string): string {
    return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
  }

  /**
   * Build the image portion of a Replicate prediction input from one or more
   * source images, using the model's declared schema (replicate-manifest) to
   * pick the correct input field — single (`image`, `input_image`, …) vs list
   * (`image_input`, `images`, …). Falls back to the common conventions when the
   * model isn't in the manifest. Empty buffers are dropped.
   */
  private imageInput(
    modelId: string,
    images: Uint8Array[]
  ) {
    const dataUris = images
      .filter((b) => b && b.length > 0)
      .map((b) => this.dataUri(b, "image/png"));
    if (dataUris.length === 0) return {};

    const field = selectPrimaryImageInput(
      getModelImageInputs(
        "@nodetool-ai/replicate-nodes",
        "replicate-manifest.json",
        modelId
      ),
      dataUris.length
    );
    if (field) {
      return { [field.apiName]: field.isList ? dataUris : dataUris[0] };
    }
    // Unknown model: fall back to the common conventions.
    return dataUris.length === 1
      ? { image: dataUris[0] }
      : { image_input: dataUris };
  }

  private async runWithInput(
    modelId: string,
    input: Record<string, unknown>
  ): Promise<Uint8Array> {
    const output = await this._client.run(modelId as `${string}/${string}`, {
      input
    });
    return this._fetchOutputBytes(output);
  }

  override async upscaleImage(
    image: Uint8Array,
    params: UpscaleImageParams
  ): Promise<Uint8Array> {
    const input: Record<string, unknown> = {
      image: this.dataUri(image, "image/png")
    };
    if (params.scale != null) input.scale = params.scale;
    if (params.prompt) input.prompt = params.prompt;
    if (params.creativity != null) input.creativity = params.creativity;
    if (params.seed != null) input.seed = params.seed;
    log.debug("upscaleImage", { model: params.model.id });
    return this.runWithInput(params.model.id, input);
  }

  override async removeBackground(
    image: Uint8Array,
    params: RemoveBackgroundParams
  ): Promise<Uint8Array> {
    log.debug("removeBackground", { model: params.model.id });
    return this.runWithInput(params.model.id, {
      image: this.dataUri(image, "image/png")
    });
  }

  override async relightImage(
    image: Uint8Array,
    params: RelightImageParams
  ): Promise<Uint8Array> {
    const input: Record<string, unknown> = {
      image: this.dataUri(image, "image/png")
    };
    if (params.prompt) input.prompt = params.prompt;
    if (params.negativePrompt) input.negative_prompt = params.negativePrompt;
    if (params.seed != null) input.seed = params.seed;
    log.debug("relightImage", { model: params.model.id });
    return this.runWithInput(params.model.id, input);
  }

  override async vectorizeImage(
    image: Uint8Array,
    params: VectorizeImageParams
  ): Promise<Uint8Array> {
    log.debug("vectorizeImage", { model: params.model.id });
    return this.runWithInput(params.model.id, {
      image: this.dataUri(image, "image/png")
    });
  }

  /**
   * Drop input fields the model does not declare in the manifest.
   *
   * Replicate fails the whole prediction on an undeclared field instead of
   * ignoring it, so a generic param bag breaks any endpoint with a narrower
   * schema. An empty declaration set means the model is not in the manifest —
   * send everything rather than silently stripping the request bare.
   */
  private pruneToDeclaredInputs(
    modelId: string,
    input: Record<string, unknown>
  ) {
    const declared = getModelInputNames(
      "@nodetool-ai/replicate-nodes",
      "replicate-manifest.json",
      modelId
    );
    if (declared.size === 0) return input;
    const pruned: Record<string, unknown> = {};
    const dropped: string[] = [];
    for (const [key, value] of Object.entries(input)) {
      if (declared.has(key)) pruned[key] = value;
      else dropped.push(key);
    }
    if (dropped.length > 0) {
      log.debug("pruned undeclared inputs", { model: modelId, dropped });
    }
    return pruned;
  }

  override async videoToVideo(
    video: Uint8Array,
    params: VideoToVideoParams
  ): Promise<Uint8Array> {
    const input: Record<string, unknown> = {
      video: this.dataUri(video, "video/mp4")
    };
    if (params.prompt) input.prompt = params.prompt;
    if (params.negativePrompt) input.negative_prompt = params.negativePrompt;
    if (params.strength != null) input.strength = params.strength;
    if (params.seed != null) input.seed = params.seed;
    log.debug("videoToVideo", { model: params.model.id });
    return this.runWithInput(
      params.model.id,
      this.pruneToDeclaredInputs(params.model.id, input)
    );
  }

  override async lipSync(
    video: Uint8Array,
    params: LipSyncParams
  ): Promise<Uint8Array> {
    const input: Record<string, unknown> = {
      video: this.dataUri(video, "video/mp4"),
      audio: this.dataUri(params.audio, "audio/mpeg")
    };
    if (params.seed != null) input.seed = params.seed;
    log.debug("lipSync", { model: params.model.id });
    return this.runWithInput(
      params.model.id,
      this.pruneToDeclaredInputs(params.model.id, input)
    );
  }

  /**
   * Replicate TTS models (elevenlabs, minimax, kokoro, chatterbox, f5-tts)
   * return an ENCODED audio file (MP3/WAV), not raw little-endian PCM. Expose
   * it through the encoded path (like textToMusic / FAL) rather than overriding
   * the streaming-PCM textToSpeech — the previous override blindly cast the
   * encoded bytes to Int16Array, producing noise (MP3) or a header click +
   * misaligned waveform (WAV).
   */
  override async textToSpeechEncoded(args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
    audioFormat?: string;
  }): Promise<EncodedAudioResult | null> {
    const input: Record<string, unknown> = { text: args.text };
    if (args.voice) input.voice = args.voice;
    if (args.speed != null) input.speed = args.speed;

    log.debug("textToSpeechEncoded", { model: args.model });
    const output = await this._client.run(args.model as `${string}/${string}`, {
      input
    });
    const bytes = await this._fetchOutputBytes(output);
    return { data: bytes, mimeType: sniffAudioMime(bytes) };
  }

  /**
   * Generate music as an encoded audio file. Replicate music models (MusicGen,
   * MiniMax Music, ElevenLabs Music, …) return a file URL / FileOutput, so this
   * runs the model and downloads the encoded audio bytes.
   */
  override async textToMusic(
    params: TextToMusicParams
  ): Promise<EncodedAudioResult> {
    if (!params.prompt) throw new Error("Prompt is required");

    const input: Record<string, unknown> = { prompt: params.prompt };
    if (params.lyrics) input.lyrics = params.lyrics;
    if (params.durationSeconds != null) {
      input.duration = Math.round(params.durationSeconds);
    }
    if (params.seed != null) input.seed = params.seed;

    log.debug("textToMusic", { model: params.model.id });
    const output = await this._client.run(
      params.model.id as `${string}/${string}`,
      { input }
    );
    const bytes = await this._fetchOutputBytes(output);
    return { data: bytes, mimeType: sniffAudioMime(bytes) };
  }
}
