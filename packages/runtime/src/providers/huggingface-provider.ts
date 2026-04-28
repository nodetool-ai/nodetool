import { createLogger } from "@nodetool-ai/config";
import { BaseProvider } from "./base-provider.js";
import type { Chunk } from "@nodetool-ai/protocol";
import type {
  ImageModel,
  LanguageModel,
  VideoModel,
  Message,
  MessageContent,
  MessageTextContent,
  ProviderStreamItem,
  ProviderTool,
  EncodedAudioResult,
  TextToImageParams,
  TTSModel
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.huggingface");

// ---------------------------------------------------------------------------
// HF Inference SDK (lazy-loaded)
// ---------------------------------------------------------------------------

let _hfModule: any = null;

async function getHfInference(apiKey: string): Promise<any> {
  if (!_hfModule) {
    try {
      _hfModule = await (Function(
        'return import("@huggingface/inference")'
      )() as Promise<any>);
    } catch {
      throw new Error(
        "@huggingface/inference is required for HuggingFaceProvider. " +
          "Install it with: npm install @huggingface/inference"
      );
    }
  }
  const HfInference = _hfModule.HfInference ?? _hfModule.default?.HfInference;
  if (!HfInference) {
    throw new Error(
      "Could not find HfInference class in @huggingface/inference"
    );
  }
  return new HfInference(apiKey);
}

// ---------------------------------------------------------------------------
// Live HF Hub model discovery — queries warm inference models by pipeline tag,
// sorted by likes, limited to 100 results, cached for 10 minutes.
// Uses direct fetch because `@huggingface/hub` listModels does not expose the
// `inference=warm` filter needed to limit results to inference-ready models.
// ---------------------------------------------------------------------------

const HF_API_BASE = "https://huggingface.co/api/models";
const CACHE_TTL_MS = 10 * 60 * 1000;
const MODEL_LIMIT = 100;

interface HfModelEntry {
  id: string;
  likes?: number;
  pipeline_tag?: string;
}

interface CachedResult<T> {
  data: T;
  timestamp: number;
}

const _modelCache = new Map<string, CachedResult<HfModelEntry[]>>();

async function fetchHfModels(pipelineTag: string): Promise<HfModelEntry[]> {
  const cached = _modelCache.get(pipelineTag);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `${HF_API_BASE}?pipeline_tag=${encodeURIComponent(pipelineTag)}&inference=warm&sort=likes&direction=-1&limit=${MODEL_LIMIT}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      log.warn(`HF API returned ${res.status} for ${pipelineTag}`);
      return cached?.data ?? [];
    }
    const data = (await res.json()) as HfModelEntry[];
    _modelCache.set(pipelineTag, { data, timestamp: Date.now() });
    return data;
  } catch (err) {
    log.warn(`Failed to fetch HF models for ${pipelineTag}: ${err}`);
    return cached?.data ?? [];
  }
}

function hfModelName(id: string): string {
  // "black-forest-labs/FLUX.1-schnell" → "FLUX.1 Schnell"
  const parts = id.split("/");
  const raw = parts[parts.length - 1];
  return raw
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function getHfLanguageModels(): Promise<LanguageModel[]> {
  const entries = await fetchHfModels("text-generation");
  return entries.map((m) => ({
    id: m.id,
    name: hfModelName(m.id),
    provider: "huggingface"
  }));
}

async function getHfImageModels(): Promise<ImageModel[]> {
  const entries = await fetchHfModels("text-to-image");
  return entries.map((m) => ({
    id: m.id,
    name: hfModelName(m.id),
    provider: "huggingface",
    supportedTasks: ["text_to_image"]
  }));
}

async function getHfVideoModels(): Promise<VideoModel[]> {
  const entries = await fetchHfModels("text-to-video");
  return entries.map((m) => ({
    id: m.id,
    name: hfModelName(m.id),
    provider: "huggingface",
    supportedTasks: ["text_to_video"]
  }));
}

async function getHfTTSModels(): Promise<TTSModel[]> {
  const entries = await fetchHfModels("text-to-speech");
  return entries.map((m) => ({
    id: m.id,
    name: hfModelName(m.id),
    provider: "huggingface"
  }));
}

interface HuggingFaceProviderOptions {
  /** Override for testing — inject a mock HfInference instance. */
  hfClient?: any;
}

function extractTextContent(
  content: string | MessageContent[] | null | undefined
): string {
  if (typeof content === "string") return content;
  if (!content) return "";
  return content
    .filter((c): c is MessageTextContent => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

export class HuggingFaceProvider extends BaseProvider {
  static override requiredSecrets(): string[] {
    return ["HF_TOKEN"];
  }

  private readonly _apiKey: string;
  private _hfClient: any = null;

  constructor(
    secrets: { HF_TOKEN?: string },
    options: HuggingFaceProviderOptions = {}
  ) {
    super("huggingface");
    const apiKey = secrets.HF_TOKEN;
    if (!apiKey) {
      throw new Error("HF_TOKEN is required");
    }
    this._apiKey = apiKey;
    if (options.hfClient) {
      this._hfClient = options.hfClient;
    }
  }

  get apiKey(): string {
    return this._apiKey;
  }

  override getContainerEnv(): Record<string, string> {
    return { HF_TOKEN: this._apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return false;
  }

  private async getClient(): Promise<any> {
    if (!this._hfClient) {
      this._hfClient = await getHfInference(this._apiKey);
    }
    return this._hfClient;
  }

  override async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  }): Promise<Message> {
    const client = await this.getClient();

    const hfMessages = args.messages.map((m) => ({
      role: m.role === "tool" ? "user" : m.role,
      content: extractTextContent(m.content)
    }));

    log.debug("HuggingFace chatCompletion", { model: args.model });

    const response = await client.chatCompletion({
      model: args.model,
      messages: hfMessages,
      max_tokens: args.maxTokens ?? 4096,
      ...(args.temperature != null ? { temperature: args.temperature } : {}),
      ...(args.topP != null ? { top_p: args.topP } : {})
    });

    const choice = response?.choices?.[0];
    if (!choice) {
      throw new Error("HuggingFace returned no choices");
    }

    const usage = response.usage;
    if (usage) {
      this.trackUsage(args.model, {
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0
      });
    }

    return {
      role: "assistant",
      content: choice.message?.content ?? null
    };
  }

  override async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    toolChoice?: string | "any";
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    audio?: Record<string, unknown>;
  }): AsyncGenerator<ProviderStreamItem> {
    const client = await this.getClient();

    const hfMessages = args.messages.map((m) => ({
      role: m.role === "tool" ? "user" : m.role,
      content: extractTextContent(m.content)
    }));

    log.debug("HuggingFace chatCompletionStream", { model: args.model });

    const stream = client.chatCompletionStream({
      model: args.model,
      messages: hfMessages,
      max_tokens: args.maxTokens ?? 4096,
      ...(args.temperature != null ? { temperature: args.temperature } : {}),
      ...(args.topP != null ? { top_p: args.topP } : {})
    });

    for await (const chunk of stream) {
      const choice = chunk?.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;

      if (delta?.content !== undefined || choice.finish_reason === "stop") {
        const item: Chunk = {
          type: "chunk",
          content: String(delta?.content ?? ""),
          done: choice.finish_reason === "stop"
        };
        yield item;
      }
    }
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const client = await this.getClient();

    log.debug("HuggingFace textToImage", { model: params.model.id });

    const request: Record<string, unknown> = {
      model: params.model.id,
      inputs: params.prompt
    };

    if (params.negativePrompt) {
      request.parameters = {
        ...((request.parameters as Record<string, unknown>) ?? {}),
        negative_prompt: params.negativePrompt
      };
    }
    if (params.guidanceScale != null) {
      request.parameters = {
        ...((request.parameters as Record<string, unknown>) ?? {}),
        guidance_scale: params.guidanceScale
      };
    }
    if (params.numInferenceSteps != null) {
      request.parameters = {
        ...((request.parameters as Record<string, unknown>) ?? {}),
        num_inference_steps: params.numInferenceSteps
      };
    }
    if (params.width) {
      request.parameters = {
        ...((request.parameters as Record<string, unknown>) ?? {}),
        width: params.width
      };
    }
    if (params.height) {
      request.parameters = {
        ...((request.parameters as Record<string, unknown>) ?? {}),
        height: params.height
      };
    }

    const result = await client.textToImage(request);

    // Result can be a Blob or ArrayBuffer
    if (result instanceof Uint8Array) {
      return result;
    }
    if (result instanceof ArrayBuffer) {
      return new Uint8Array(result);
    }
    if (typeof result?.arrayBuffer === "function") {
      return new Uint8Array(await result.arrayBuffer());
    }

    throw new Error("HuggingFace textToImage returned unexpected result type");
  }

  /**
   * HuggingFace TTS returns encoded audio (typically FLAC) — not raw PCM.
   * Use the encoded path so the caller stores the bytes directly.
   */
  override async textToSpeechEncoded(args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
    /** Ignored — HuggingFace models return their native encoding. */
    audioFormat?: string;
  }): Promise<EncodedAudioResult | null> {
    if (!args.text) {
      throw new Error("text must not be empty");
    }

    const client = await this.getClient();

    log.debug("HuggingFace textToSpeechEncoded", { model: args.model });

    const result = await client.textToSpeech({
      model: args.model,
      inputs: args.text
    });

    let bytes: Uint8Array;
    if (result instanceof Uint8Array) {
      bytes = result;
    } else if (result instanceof ArrayBuffer) {
      bytes = new Uint8Array(result);
    } else if (typeof result?.arrayBuffer === "function") {
      bytes = new Uint8Array(await result.arrayBuffer());
    } else {
      throw new Error(
        "HuggingFace textToSpeech returned unexpected result type"
      );
    }

    // HuggingFace Inference API returns FLAC by default for most TTS models.
    // Detect format from magic bytes, fall back to FLAC.
    let mimeType = "audio/flac";
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      mimeType = "audio/wav";
    } else if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
      mimeType = "audio/mpeg";
    } else if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
      mimeType = "audio/ogg";
    }

    return { data: bytes, mimeType };
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return getHfLanguageModels();
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return getHfImageModels();
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return getHfVideoModels();
  }

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return getHfTTSModels();
  }
}
