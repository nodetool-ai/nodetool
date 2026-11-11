import { createLogger } from "@nodetool-ai/config";
import {
  BaseProvider,
  type EndpointCallRequest,
  type EndpointCallResult,
  type ProviderCapability
} from "./base-provider.js";
import { recordGenerationReceipt } from "../generation-receipt.js";
import { isCallable, isNumber, isString } from "@nodetool-ai/protocol";
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
type HfBinary =
  | Uint8Array
  | ArrayBuffer
  | { arrayBuffer(): Promise<ArrayBuffer> };

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
  ): Promise<{
    text?: string;
    chunks?: Array<{ text?: string; timestamp?: [number, number] }>;
  }>;
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
  if (isNumber(result[0])) {
    return [result as number[]];
  }
  const rows = result as number[][] | number[][][];
  if (Array.isArray(rows[0]) && isNumber((rows[0] as number[])[0])) {
    return rows as number[][];
  }
  // number[][][] — mean-pool the token dimension of each input.
  return (rows as number[][][]).map(meanPool);
}

/**
 * Truncate each vector to `dimensions` and re-normalize it to unit length,
 * as the OpenAI `dimensions` parameter does. The HF feature-extraction API
 * has no such parameter. A no-op when `dimensions` is unset or not smaller.
 */
function truncateDimensions(
  vectors: number[][],
  dimensions: number | undefined
): number[][] {
  if (!dimensions || dimensions <= 0) return vectors;
  return vectors.map((vector) => {
    if (vector.length <= dimensions) return vector;
    const sliced = vector.slice(0, dimensions);
    const norm = Math.sqrt(sliced.reduce((sum, x) => sum + x * x, 0));
    return norm > 0 ? sliced.map((x) => x / norm) : sliced;
  });
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
  if (isCallable(result?.arrayBuffer)) {
    return new Uint8Array(await result.arrayBuffer());
  }
  throw new Error("HuggingFace returned an unexpected binary result type");
}

let _hfModule: HfInferenceModule | null = null;

/** The message every path reports when the optional dependency is absent. */
const HF_MODULE_MISSING =
  "@huggingface/inference is required for HuggingFaceProvider. " +
  "Install it with: npm install @huggingface/inference";

async function loadHfModule(): Promise<HfInferenceModule> {
  if (!_hfModule) {
    try {
      _hfModule = await (Function(
        'return import("@huggingface/inference")'
      )() as Promise<HfInferenceModule>);
    } catch {
      throw new Error(HF_MODULE_MISSING);
    }
  }
  return _hfModule;
}

async function getHfInference(apiKey: string): Promise<HfClient> {
  const module = await loadHfModule();
  const HfInference = module.HfInference ?? module.default?.HfInference;
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
  return raw.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
  /** Override for testing — the fetch endpoint calls use. */
  fetchFn?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Endpoint calls: the Inference Providers router, task by task
// ---------------------------------------------------------------------------

const HF_ROUTER_BASE = "https://router.huggingface.co";

/**
 * The task ids `callEndpoint` accepts as `route`. `chat-completion` posts to
 * the OpenAI-compatible `/v1/chat/completions`. Every other task posts its
 * `{ inputs, parameters }` body to `/hf-inference/models/{model}`.
 */
const HF_ENDPOINT_TASKS: ReadonlySet<string> = new Set([
  "chat-completion",
  "text-generation",
  "summarization",
  "translation",
  "fill-mask",
  "question-answering",
  "table-question-answering",
  "feature-extraction",
  "text-classification",
  "token-classification",
  "zero-shot-classification",
  "text-to-image",
  "image-to-image",
  "image-classification",
  "image-segmentation",
  "object-detection",
  "automatic-speech-recognition",
  "audio-classification",
  "text-to-video"
]);

/**
 * Tasks that answer with media. Their output is `{ data, mimeType }`, the
 * shape the generation seam keeps out of the prediction message.
 */
const HF_BINARY_TASKS: ReadonlySet<string> = new Set([
  "text-to-image",
  "image-to-image",
  "text-to-video"
]);

/** The base64 payload of a JSON media envelope, or null when it has none. */
function envelopeBase64(json: unknown): string | null {
  if (isString(json)) return json;
  if (Array.isArray(json) && json.length > 0) return envelopeBase64(json[0]);
  if (json !== null && typeof json === "object") {
    const record = json as Record<string, unknown>;
    for (const key of [
      "image",
      "video",
      "audio",
      "data",
      "b64_json",
      "generated_image"
    ]) {
      const value = record[key];
      if (isString(value)) return value.replace(/^data:[^,]+,/, "");
    }
  }
  return null;
}

function envelopeMime(json: unknown): string | null {
  if (json !== null && typeof json === "object" && !Array.isArray(json)) {
    const record = json as Record<string, unknown>;
    if (isString(record.video)) return "video/mp4";
    if (isString(record.audio)) return "audio/flac";
  }
  return null;
}

function extractTextContent(
  content: string | MessageContent[] | null | undefined
): string {
  if (isString(content)) return content;
  if (!content) return "";
  return content
    .filter((c): c is MessageTextContent => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

type HfChatPayload = {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
};

/**
 * The HF chat request body, with temperature and top_p omitted when the caller
 * did not set them.
 */
function chatPayload(
  args: {
    model: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
  },
  messages: Array<{ role: string; content: string }>
): HfChatPayload {
  const payload: HfChatPayload = {
    model: args.model,
    messages,
    max_tokens: args.maxTokens ?? 4096
  };
  if (args.temperature != null) {
    payload.temperature = args.temperature;
  }
  if (args.topP != null) {
    payload.top_p = args.topP;
  }
  return payload;
}

export class HuggingFaceProvider extends BaseProvider {
  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return [
      "text_to_image",
      "image_to_image",
      "text_to_video",
      "text_to_speech",
      "automatic_speech_recognition",
      "generate_embedding"
    ];
  }

  static override requiredSecrets(): string[] {
    return ["HF_TOKEN"];
  }

  private readonly _apiKey: string;
  private _hfClient: HfClient | null = null;
  private readonly _fetch: typeof fetch;

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
    this._fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  override supportsEndpointCalls(): boolean {
    return true;
  }

  /**
   * POST one Inference Providers task to the router. `route` is the task id
   * (see HF_ENDPOINT_TASKS) and `input` the body the task expects. JSON tasks
   * return the parsed response. Media tasks return `{ data, mimeType }`,
   * decoding a provider's base64 JSON envelope when it sends one.
   *
   * Vendor media inputs travel inline as base64 in `input`, so there is no
   * upload step: `uploadMedia` keeps the base default.
   */
  override async callEndpoint(
    req: EndpointCallRequest
  ): Promise<EndpointCallResult> {
    const task = req.route;
    if (task === undefined || !HF_ENDPOINT_TASKS.has(task)) {
      throw new Error(
        `huggingface endpoint route must be a task id (${[...HF_ENDPOINT_TASKS].join(", ")}), got ${task === undefined ? "none" : `"${task}"`}`
      );
    }
    const chat = task === "chat-completion";
    const binary = HF_BINARY_TASKS.has(task);
    const url = chat
      ? `${HF_ROUTER_BASE}/v1/chat/completions`
      : `${HF_ROUTER_BASE}/hf-inference/models/${req.model}`;
    const body = chat ? { model: req.model, ...req.input } : req.input;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this._apiKey}`,
      "Content-Type": "application/json"
    };
    if (binary) {
      headers.Accept = "image/png, video/mp4, application/octet-stream";
    }
    const init: RequestInit = {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    };
    if (req.signal) init.signal = req.signal;

    const res = await this._fetch(url, init);
    if (!res.ok) {
      let detail = "";
      try {
        detail = await res.text();
      } catch {
        /* response body already consumed or unavailable */
      }
      throw new Error(
        `Hugging Face inference failed for "${req.model}" (${res.status}): ${detail || res.statusText}`
      );
    }
    const requestId = res.headers.get("x-request-id");
    if (requestId) recordGenerationReceipt({ provider_request_id: requestId });
    const contentType = res.headers.get("content-type") ?? "";
    if (!binary) {
      const output: unknown = await res.json();
      return { output, requestId };
    }
    if (contentType.includes("application/json")) {
      const json: unknown = await res.json();
      const base64 = envelopeBase64(json);
      if (!base64) {
        throw new Error(
          `Hugging Face returned JSON without media for "${req.model}": ${JSON.stringify(json).slice(0, 200)}`
        );
      }
      return {
        output: {
          data: new Uint8Array(Buffer.from(base64, "base64")),
          mimeType: envelopeMime(json) ?? "image/png"
        },
        requestId
      };
    }
    return {
      output: {
        data: new Uint8Array(await res.arrayBuffer()),
        mimeType: contentType || "application/octet-stream"
      },
      requestId
    };
  }

  /**
   * `@huggingface/inference` is an optional dependency, so a host can hold a
   * valid HF_TOKEN and still be unable to run a single call. Report that here
   * rather than at the first generation.
   */
  override async unavailableReason(): Promise<string | null> {
    if (this._hfClient) return null;
    try {
      await loadHfModule();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  get apiKey(): string {
    return this._apiKey;
  }

  override getContainerEnv() {
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

    const requestPayload = chatPayload(args, hfMessages);
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

    const requestPayload = chatPayload(args, hfMessages);
    this.recordRequestPayload(requestPayload);
    const stream = client.chatCompletionStream(requestPayload, {
      signal: args.signal
    });

    for await (const chunk of stream) {
      // OpenAI-compatible streams (which the HF Inference SDK proxies) carry
      // usage on the terminal chunk. Record it, otherwise every streamed HF
      // call reports 0 tokens / $0 cost (the non-streaming path already tracks).
      const usage = (
        chunk
      )?.usage;
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

      // Emit a terminal `done: true` chunk for every non-"stop" terminal reason
      // (length, eos_token, tool_calls, content_filter) too, so consumers that
      // finalize on `done` get a consistent end-of-stream marker. "stop" already
      // emitted its terminal chunk above.
      if (choice.finish_reason && choice.finish_reason !== "stop") {
        const doneChunk: Chunk = { type: "chunk", content: "", done: true };
        yield doneChunk;
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
    if (params.negativePrompt)
      parameters.negative_prompt = params.negativePrompt;
    if (params.guidanceScale != null)
      parameters.guidance_scale = params.guidanceScale;
    if (params.numInferenceSteps != null)
      parameters.num_inference_steps = params.numInferenceSteps;
    if (params.targetWidth && params.targetHeight) {
      parameters.target_size = {
        width: params.targetWidth,
        height: params.targetHeight
      };
    }

    type RequestFields = {
      model: string;
      inputs: Blob;
      parameters?: typeof parameters;
    };
    const request: RequestFields = {
      model: params.model.id,
      inputs: new Blob([new Uint8Array(image)])
    };
    if (Object.keys(parameters).length > 0) {
      request.parameters = parameters;
    }
    const result = await client.imageToImage(request);
    return toBytes(result);
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const client = await this.getClient();

    log.debug("HuggingFace textToVideo", { model: params.model.id });

    const parameters: Record<string, unknown> = {};
    if (params.negativePrompt)
      parameters.negative_prompt = params.negativePrompt;
    if (params.numFrames != null) parameters.num_frames = params.numFrames;
    if (params.guidanceScale != null)
      parameters.guidance_scale = params.guidanceScale;
    if (params.numInferenceSteps != null)
      parameters.num_inference_steps = params.numInferenceSteps;
    if (params.seed != null) parameters.seed = params.seed;

    type RequestFields2 = {
      model: string;
      inputs: string;
      parameters?: typeof parameters;
    };
    const request: RequestFields2 = {
      model: params.model.id,
      inputs: params.prompt
    };
    if (Object.keys(parameters).length > 0) {
      request.parameters = parameters;
    }
    const result = await client.textToVideo(request);
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

    type RequestFields3 = {
      model: string;
      data: Blob;
      parameters?: { return_timestamps: boolean };
    };
    const request: RequestFields3 = {
      model: args.model,
      data: new Blob([new Uint8Array(args.audio)])
    };
    if (args.word_timestamps) {
      request.parameters = { return_timestamps: true };
    }
    const result = await client.automaticSpeechRecognition(request);

    const asr: ASRResult = { text: result?.text ?? "" };
    if (result?.chunks) {
      asr.chunks = result.chunks.map((c) => ({
        text: c.text ?? "",
        timestamp: c.timestamp ?? [0, 0]
      }));
    }
    return asr;
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

    return truncateDimensions(normalizeEmbedding(result), args.dimensions);
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
    } else if (isCallable(result?.arrayBuffer)) {
      bytes = new Uint8Array(await result.arrayBuffer());
    } else {
      throw new Error(
        "HuggingFace textToSpeech returned unexpected result type"
      );
    }

    // HuggingFace Inference API returns FLAC by default for most TTS models.
    // Detect format from magic bytes, fall back to FLAC.
    let mimeType = "audio/flac";
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46
    ) {
      mimeType = "audio/wav";
    } else if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
      mimeType = "audio/mpeg";
    } else if (
      bytes[0] === 0x4f &&
      bytes[1] === 0x67 &&
      bytes[2] === 0x67 &&
      bytes[3] === 0x53
    ) {
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
