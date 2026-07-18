import { createLogger } from "@nodetool-ai/config";
import { BaseProvider } from "./base-provider.js";
import type { Chunk } from "@nodetool-ai/protocol";
import type {
  ASRModel,
  ASRResult,
  EmbeddingModel,
  ImageModel,
  ImageToImageParams,
  LanguageModel,
  VideoModel,
  Message,
  MessageContent,
  MessageTextContent,
  ProviderStreamItem,
  ProviderTool,
  EncodedAudioResult,
  TextToImageParams,
  TextToVideoParams,
  TTSModel
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.huggingface");

// ---------------------------------------------------------------------------
// HF Inference SDK (lazy-loaded)
// ---------------------------------------------------------------------------

/** Minimal shape of the @huggingface/inference module (optional dependency). */
interface HfInferenceModule {
  HfInference?: new (apiKey: string) => HfClient;
  default?: { HfInference?: new (apiKey: string) => HfClient };
}

interface HfChatChoice {
  message?: { content?: string | null };
  delta?: { content?: string | null };
  finish_reason?: string;
}

interface HfChatResponse {
  choices?: HfChatChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** A binary result the SDK may return as bytes, a buffer, or a Blob. */
type HfBinary = Uint8Array | ArrayBuffer | { arrayBuffer(): Promise<ArrayBuffer> };

/** Minimal shape of the HfInference client used by this provider. */
interface HfClient {
  chatCompletion(
    params: Record<string, unknown>,
    options?: { signal?: AbortSignal }
  ): Promise<HfChatResponse>;
  chatCompletionStream(
    params: Record<string, unknown>,
    options?: { signal?: AbortSignal }
  ): AsyncIterable<HfChatResponse>;
  textToImage(params: Record<string, unknown>): Promise<HfBinary>;
  imageToImage(params: Record<string, unknown>): Promise<HfBinary>;
  textToVideo(params: Record<string, unknown>): Promise<HfBinary>;
  textToSpeech(params: Record<string, unknown>): Promise<HfBinary>;
  automaticSpeechRecognition(
    params: Record<string, unknown>
  ): Promise<{ text?: string; chunks?: Array<{ text?: string; timestamp?: [number, number] }> }>;
  featureExtraction(
    params: Record<string, unknown>
  ): Promise<number[] | number[][] | number[][][]>;
}

/**
 * Normalize a feature-extraction result into a list of embedding vectors.
 * Sentence-transformer models return `number[]` (single) or `number[][]`
 * (batch); token-level models may nest deeper, in which case we mean-pool the
 * token axis so callers always get one vector per input.
 */
function normalizeEmbedding(
  result: number[] | number[][] | number[][][]
): number[][] {
  if (!Array.isArray(result) || result.length === 0) return [];
  if (typeof result[0] === "number") {
    return [result as number[]];
  }
  const rows = result as number[][] | number[][][];
  if (Array.isArray(rows[0]) && typeof (rows[0] as number[])[0] === "number") {
    return rows as number[][];
  }
  // number[][][] — mean-pool the token dimension of each input.
  return (rows as number[][][]).map(meanPool);
}

function meanPool(tokens: number[][]): number[] {
  if (tokens.length === 0) return [];
  const dim = tokens[0].length;
  const out = new Array<number>(dim).fill(0);
  for (const token of tokens) {
    for (let i = 0; i < dim; i++) out[i] += token[i] ?? 0;
  }
  for (let i = 0; i < dim; i++) out[i] /= tokens.length;
  return out;
}

/** Coerce any binary-ish SDK result into a Uint8Array. */
async function toBytes(result: HfBinary): Promise<Uint8Array> {
  if (result instanceof Uint8Array) return result;
  if (result instanceof ArrayBuffer) return new Uint8Array(result);
  if (typeof result?.arrayBuffer === "function") {
    return new Uint8Array(await result.arrayBuffer());
  }
  throw new Error("HuggingFace returned an unexpected binary result type");
}

let _hfModule: HfInferenceModule | null = null;

async function getHfInference(apiKey: string): Promise<HfClient> {
  if (!_hfModule) {
    try {
      _hfModule = await (Function(
        'return import("@huggingface/inference")'
      )() as Promise<HfInferenceModule>);
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

async function getHfASRModels(): Promise<ASRModel[]> {
  const entries = await fetchHfModels("automatic-speech-recognition");
  return entries.map((m) => ({
    id: m.id,
    name: hfModelName(m.id),
    provider: "huggingface"
  }));
}

async function getHfEmbeddingModels(): Promise<EmbeddingModel[]> {
  const entries = await fetchHfModels("feature-extraction");
  return entries.map((m) => ({
    id: m.id,
    name: hfModelName(m.id),
    provider: "huggingface"
  }));
}

interface HuggingFaceProviderOptions {
  /** Override for testing — inject a mock HfInference instance. */
  hfClient?: HfClient;
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
  private _hfClient: HfClient | null = null;

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

  private async getClient(): Promise<HfClient> {
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
    signal?: AbortSignal;
  }): Promise<Message> {
    const client = await this.getClient();

    const hfMessages = args.messages.map((m) => ({
      role: m.role === "tool" ? "user" : m.role,
      content: extractTextContent(m.content)
    }));

    log.debug("HuggingFace chatCompletion", { model: args.model });

    const requestPayload = {
      model: args.model,
      messages: hfMessages,
      max_tokens: args.maxTokens ?? 4096,
      ...(args.temperature != null ? { temperature: args.temperature } : {}),
      ...(args.topP != null ? { top_p: args.topP } : {})
    };
    this.recordRequestPayload(requestPayload);
    const response = await client.chatCompletion(requestPayload, {
      signal: args.signal
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
    signal?: AbortSignal;
  }): AsyncGenerator<ProviderStreamItem> {
    const client = await this.getClient();

    const hfMessages = args.messages.map((m) => ({
      role: m.role === "tool" ? "user" : m.role,
      content: extractTextContent(m.content)
    }));

    log.debug("HuggingFace chatCompletionStream", { model: args.model });

    const requestPayload = {
      model: args.model,
      messages: hfMessages,
      max_tokens: args.maxTokens ?? 4096,
      ...(args.temperature != null ? { temperature: args.temperature } : {}),
      ...(args.topP != null ? { top_p: args.topP } : {})
    };
    this.recordRequestPayload(requestPayload);
    const stream = client.chatCompletionStream(requestPayload, {
      signal: args.signal
    });

    for await (const chunk of stream) {
      // OpenAI-compatible streams (which the HF Inference SDK proxies) carry
      // usage on the terminal chunk. Record it, otherwise every streamed HF
      // call reports 0 tokens / $0 cost (the non-streaming path already tracks).
      const usage = (chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number } })
        ?.usage;
      if (usage) {
        this.trackUsage(args.model, {
          inputTokens: usage.prompt_tokens ?? 0,
          outputTokens: usage.completion_tokens ?? 0
        });
      }

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
    return toBytes(result);
  }

  override async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const client = await this.getClient();
    const image = images[0] ?? new Uint8Array();

    log.debug("HuggingFace imageToImage", { model: params.model.id });

    const parameters: Record<string, unknown> = {};
    if (params.prompt) parameters.prompt = params.prompt;
    if (params.negativePrompt) parameters.negative_prompt = params.negativePrompt;
    if (params.guidanceScale != null) parameters.guidance_scale = params.guidanceScale;
    if (params.numInferenceSteps != null)
      parameters.num_inference_steps = params.numInferenceSteps;
    if (params.targetWidth && params.targetHeight) {
      parameters.target_size = {
        width: params.targetWidth,
        height: params.targetHeight
      };
    }

    const result = await client.imageToImage({
      model: params.model.id,
      inputs: new Blob([new Uint8Array(image) as Uint8Array<ArrayBuffer>]),
      ...(Object.keys(parameters).length > 0 ? { parameters } : {})
    });
    return toBytes(result);
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const client = await this.getClient();

    log.debug("HuggingFace textToVideo", { model: params.model.id });

    const parameters: Record<string, unknown> = {};
    if (params.negativePrompt) parameters.negative_prompt = params.negativePrompt;
    if (params.numFrames != null) parameters.num_frames = params.numFrames;
    if (params.guidanceScale != null) parameters.guidance_scale = params.guidanceScale;
    if (params.numInferenceSteps != null)
      parameters.num_inference_steps = params.numInferenceSteps;
    if (params.seed != null) parameters.seed = params.seed;

    const result = await client.textToVideo({
      model: params.model.id,
      inputs: params.prompt,
      ...(Object.keys(parameters).length > 0 ? { parameters } : {})
    });
    return toBytes(result);
  }

  override async automaticSpeechRecognition(args: {
    audio: Uint8Array;
    model: string;
    language?: string;
    prompt?: string;
    temperature?: number;
    word_timestamps?: boolean;
  }): Promise<ASRResult> {
    const client = await this.getClient();

    log.debug("HuggingFace automaticSpeechRecognition", { model: args.model });

    const result = await client.automaticSpeechRecognition({
      model: args.model,
      data: new Blob([new Uint8Array(args.audio) as Uint8Array<ArrayBuffer>]),
      ...(args.word_timestamps
        ? { parameters: { return_timestamps: true } }
        : {})
    });

    return {
      text: result?.text ?? "",
      ...(result?.chunks
        ? {
            chunks: result.chunks.map((c) => ({
              text: c.text ?? "",
              timestamp: c.timestamp ?? [0, 0]
            }))
          }
        : {})
    };
  }

  override async generateEmbedding(args: {
    text: string | string[];
    model: string;
    dimensions?: number;
  }): Promise<number[][]> {
    const client = await this.getClient();

    log.debug("HuggingFace featureExtraction", { model: args.model });

    const result = await client.featureExtraction({
      model: args.model,
      inputs: args.text
    });

    return normalizeEmbedding(result);
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

  override async getAvailableASRModels(): Promise<ASRModel[]> {
    return getHfASRModels();
  }

  override async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return getHfEmbeddingModels();
  }
}
