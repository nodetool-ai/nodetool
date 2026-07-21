/**
 * Kie.ai Provider — wraps the Kie.ai API to expose image, video, audio, and
 * chat generation through the standard BaseProvider interface.
 *
 * Media model lists are loaded from the kie-manifest.json shipped by
 * @nodetool-ai/kie-nodes. Chat models use Kie.ai's model-specific chat
 * endpoints and reuse the existing OpenAI/Anthropic provider implementations
 * where their APIs are wire-compatible.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { BaseProvider } from "./base-provider.js";
import { safeFetch } from "./safe-url.js";
import { createLogger } from "@nodetool-ai/config";
import type {
  EncodedAudioResult,
  ImageModel,
  ImageToImageParams,
  InpaintingParams,
  ImageToVideoParams,
  LanguageModel,
  Message,
  MusicModel,
  ProviderStreamItem,
  TextToImageParams,
  TextToMusicParams,
  TextToVideoParams,
  TTSModel,
  VideoModel
} from "./types.js";
import {
  loadVideoModels,
  loadImageModels,
  loadMusicModels,
  loadTTSModels,
  getModelImageInputs,
  getModelInputFields,
  getManifestNodeMeta,
  selectPrimaryImageInput,
  selectMaskImageInput,
  type ModelInputField
} from "./manifest-models.js";
import { registerWebhookWait } from "./kie-webhook-registry.js";
import { sniffAudioMime } from "./audio-mime.js";
import { OpenAIProvider } from "./openai-provider.js";
import { AnthropicProvider } from "./anthropic-provider.js";
import {
  extractResponsesText,
  extractResponsesToolCalls,
  messagesToResponsesInput,
  responseToolChoice,
  responseTools,
  responseUsage,
  streamResponsesEvents
} from "./responses-api.js";

const log = createLogger("nodetool.runtime.providers.kie");

const KIE_API_BASE = "https://api.kie.ai";
const KIE_UPLOAD_URL =
  "https://kieai.redpandaai.co/api/file-stream-upload";
// The Suno API always requires a callBackUrl. When KIE_WEBHOOK_URL is set we
// use it; otherwise a placeholder satisfies the requirement (we poll instead).
const KIE_SUNO_CALLBACK = "https://nodetool.ai/kie-callback";

/**
 * When set, KIE tasks are submitted with a real callBackUrl and the provider
 * waits for the webhook instead of polling. Set to the public base URL of this
 * server (e.g. `https://myserver.example.com`).
 */
function getWebhookBaseUrl(): string | undefined {
  const url = process.env.KIE_WEBHOOK_URL;
  return url && url.trim() ? url.replace(/\/+$/, "") : undefined;
}

type KieChatApi = "openai" | "anthropic" | "responses";

interface KieChatModel {
  id: string;
  name: string;
  api: KieChatApi;
  basePath: string;
}

const KIE_CHAT_MODELS: KieChatModel[] = [
  {
    id: "gpt-5-5",
    name: "GPT 5.5",
    api: "responses",
    basePath: "/codex/v1"
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    api: "anthropic",
    basePath: "/claude"
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    api: "anthropic",
    basePath: "/claude"
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    api: "anthropic",
    basePath: "/claude"
  },
  {
    id: "gemini-3.1-pro",
    name: "Gemini 3.1 Pro",
    api: "openai",
    basePath: "/gemini-3.1-pro/v1"
  },
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    api: "openai",
    basePath: "/gemini-3-flash/v1"
  }
];

function chatModel(model: string): KieChatModel | undefined {
  return KIE_CHAT_MODELS.find((m) => m.id === model);
}

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

/** Resolve the abort reason as an Error (mirrors the gemini provider). */
function abortError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error ? signal.reason : new Error("Aborted");
}

/** Sleep that rejects promptly when `signal` aborts instead of running full. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * KIE reports API errors inside HTTP-200 bodies as `{code, msg}`. Map the known
 * error codes to a message and throw; code 200 (and any unmapped code) passes
 * through. Mirrors kie-base's `checkStatus` — without this a failed job returns
 * a 200 that the poll loop reads as "not done yet" and runs to full timeout.
 */
function checkStatus(data: Record<string, unknown>): void {
  const code = Number(data.code);
  const map: Record<number, string> = {
    401: "Unauthorized",
    402: "Insufficient Credits",
    404: "Not Found",
    422: "Validation Error",
    429: "Rate Limited",
    455: "Service Unavailable",
    500: "Server Error",
    501: "Generation Failed",
    505: "Feature Disabled"
  };
  if (map[code]) throw new Error(`${map[code]}: ${JSON.stringify(data)}`);
}

/**
 * Parse a KIE JSON response defensively: a gateway 502 returns an HTML page, not
 * JSON, so read the text and surface a "Kie <label> failed: <status> …" error
 * with a body snippet rather than a bare SyntaxError. Applies the HTTP-200 error
 * envelope check ({@link checkStatus}) on every parsed body.
 */
async function parseKieJson(
  res: Response,
  label: string
): Promise<Record<string, unknown>> {
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Kie ${label} failed: ${res.status} ${text.slice(0, 200)}`
    );
  }
  if (data.code !== undefined) checkStatus(data);
  return data;
}

/** Detect an image container from its magic bytes; defaults to PNG. */
function sniffImageType(bytes: Uint8Array): { mime: string; ext: string } {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { mime: "image/png", ext: "png" };
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return { mime: "image/gif", ext: "gif" };
  }
  return { mime: "image/png", ext: "png" };
}

/** Parse an "a:b" aspect ratio string into its numeric value, or undefined. */
function aspectToNumber(ratio: string): number | undefined {
  const m = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(ratio.trim());
  if (!m) return undefined;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return undefined;
  return w / h;
}

/** Choose the declared enum aspect ratio closest to a target numeric ratio. */
function nearestAspect(
  enumValues: string[],
  target: number
): string | undefined {
  let best: { value: string; diff: number } | undefined;
  for (const value of enumValues) {
    const n = aspectToNumber(value);
    if (n === undefined) continue;
    const diff = Math.abs(n - target);
    if (!best || diff < best.diff) best = { value, diff };
  }
  return best?.value ?? enumValues[0];
}

/**
 * Coerce a requested duration (seconds) to the model's declared `duration`
 * field type: snap to the nearest allowed enum value (sent as the enum's own
 * value type — the manifest enums are strings), round to an int, or pass a
 * float through. Returns undefined when the model declares no duration field.
 */
function coerceDuration(
  field: ModelInputField | undefined,
  seconds: number
): unknown {
  if (!field) return undefined;
  if (field.type === "enum" && field.enumValues && field.enumValues.length > 0) {
    let best: { value: string; diff: number } | undefined;
    for (const value of field.enumValues) {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      const diff = Math.abs(n - seconds);
      if (!best || diff < best.diff) best = { value, diff };
    }
    return best?.value ?? field.enumValues[0];
  }
  if (field.type === "float") return seconds;
  // int and any other numeric type: send a rounded integer.
  return Math.round(seconds);
}

/**
 * A field's default usable as an input value: the declared default when it's
 * meaningful (not an empty string), otherwise the first enum option. KIE's
 * required `model` field ships with an empty default, so the first declared
 * version is used.
 */
function defaultForField(field: ModelInputField): unknown {
  const d = field.default;
  if (d !== undefined && !(typeof d === "string" && d === "")) return d;
  if (field.enumValues && field.enumValues.length > 0) return field.enumValues[0];
  return undefined;
}

/**
 * Upload raw image bytes to KIE's file store and return the hosted URL. Sniffs
 * the container from the magic bytes so the upload carries the right mime and
 * extension (KIE rejects a JPEG announced as PNG).
 */
async function uploadImageBytes(
  apiKey: string,
  bytes: Uint8Array,
  signal?: AbortSignal
): Promise<string> {
  const { mime, ext } = sniffImageType(bytes);
  const fileName = `upload-${Date.now()}.${ext}`;
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), fileName);
  form.append("uploadPath", "images/user-uploads");
  form.append("fileName", fileName);
  const res = await fetch(KIE_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal
  });
  const data = await parseKieJson(res, "upload");
  if (!res.ok || !data.success) {
    throw new Error(`Kie upload failed: ${res.status} ${JSON.stringify(data)}`);
  }
  const downloadUrl = (data.data as Record<string, unknown>)
    ?.downloadUrl as string;
  if (!downloadUrl) {
    throw new Error(`No downloadUrl in Kie upload response`);
  }
  return downloadUrl;
}

async function submitTask(
  apiKey: string,
  model: string,
  input: Record<string, unknown>,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ model, input }),
    signal
  });
  const data = await parseKieJson(res, "submit");
  if (!res.ok) {
    throw new Error(`Kie submit failed: ${res.status} ${JSON.stringify(data)}`);
  }
  const taskId = (data.data as Record<string, unknown>)?.taskId as string;
  if (!taskId) {
    throw new Error(`No taskId in Kie response: ${JSON.stringify(data)}`);
  }
  return taskId;
}

/**
 * Submit a task with an optional webhook callback URL. When webhook mode is
 * enabled, the callBackUrl is injected into the input so KIE calls us back
 * when the task completes. The generic `/api/kie/webhook` endpoint extracts
 * the taskId from the callback body.
 */
async function submitTaskWithWebhook(
  apiKey: string,
  model: string,
  input: Record<string, unknown>,
  signal?: AbortSignal
): Promise<string> {
  const webhookBase = getWebhookBaseUrl();
  const finalInput = webhookBase
    ? { ...input, callBackUrl: `${webhookBase}/api/kie/webhook` }
    : input;
  return submitTask(apiKey, model, finalInput, signal);
}

async function pollUntilDone(
  apiKey: string,
  taskId: string,
  pollInterval = 4000,
  maxAttempts = 300,
  signal?: AbortSignal
): Promise<void> {
  const url = `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`;
  // KIE reports failures two ways that both look like "still running" to a naive
  // loop: a persistent non-OK poll (429/5xx/revoked key) after createTask
  // succeeded, and an HTTP-200 body carrying an error `code` (checkStatus). Both
  // used to run the full maxAttempts (~20 min) before blaming a slow job. Fail
  // fast: on a bounded run of consecutive HTTP errors, and immediately on a code
  // envelope (via parseKieJson).
  const MAX_CONSECUTIVE_ERRORS = 5;
  let consecutiveErrors = 0;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(url, { headers: headers(apiKey), signal });
    if (!res.ok) {
      consecutiveErrors += 1;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `Kie recordInfo failed ${consecutiveErrors}× (HTTP ${res.status}) for taskId ${taskId}: ${body.slice(0, 200)}`
        );
      }
      await sleep(pollInterval, signal);
      continue;
    }
    consecutiveErrors = 0;
    const data = await parseKieJson(res, "recordInfo");
    const state = (data.data as Record<string, unknown>)?.state as string;
    if (state === "success") return;
    if (state === "failed" || state === "fail") {
      const msg =
        (data.data as Record<string, unknown>)?.failMsg || "Unknown error";
      throw new Error(`Kie task failed: ${msg} (taskId: ${taskId})`);
    }
    await sleep(pollInterval, signal);
  }
  const timeoutSeconds = (maxAttempts * pollInterval) / 1000;
  throw new Error(
    `Kie task timed out after ${timeoutSeconds}s (taskId: ${taskId}). ` +
      "The job may still complete on KIE — check recordInfo or the KIE dashboard."
  );
}

/**
 * Wait for a KIE task to complete: use webhook if KIE_WEBHOOK_URL is set,
 * otherwise fall back to polling.
 */
async function waitForCompletion(
  apiKey: string,
  taskId: string,
  pollInterval: number,
  maxAttempts: number,
  signal?: AbortSignal
): Promise<void> {
  if (getWebhookBaseUrl()) {
    const timeoutMs = pollInterval * maxAttempts;
    log.info("Waiting for KIE webhook callback", { taskId, timeoutMs });
    await registerWebhookWait(taskId, timeoutMs, signal);
    return;
  }
  await pollUntilDone(apiKey, taskId, pollInterval, maxAttempts, signal);
}

async function downloadResultBytes(
  apiKey: string,
  taskId: string,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const url = `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`;
  const res = await fetch(url, { headers: headers(apiKey), signal });
  if (!res.ok) throw new Error(`Failed to get Kie result: ${res.status}`);
  const data = await parseKieJson(res, "recordInfo");
  const resultJsonStr = (data.data as Record<string, unknown>)
    ?.resultJson as string;
  if (!resultJsonStr) throw new Error("No resultJson in Kie response");
  const resultData = JSON.parse(resultJsonStr) as Record<string, unknown>;
  const resultUrls = resultData.resultUrls as string[];
  if (!resultUrls?.length) throw new Error("No resultUrls in Kie resultJson");
  const dlRes = await safeFetch(resultUrls[0], { signal });
  if (!dlRes.ok) {
    throw new Error(`Failed to download from ${resultUrls[0]}`);
  }
  return new Uint8Array(await dlRes.arrayBuffer());
}

/**
 * Submit a Suno music task to `<sunoEndpoint>` and return the task id. The Suno
 * API is separate from the generic jobs API and always requires `callBackUrl`.
 */
async function submitSuno(
  apiKey: string,
  endpoint: string,
  input: Record<string, unknown>,
  signal?: AbortSignal
): Promise<string> {
  const callBackUrl = getWebhookBaseUrl()
    ? `${getWebhookBaseUrl()}/api/kie/webhook`
    : KIE_SUNO_CALLBACK;
  const body = { ...input, callBackUrl };
  const res = await fetch(`${KIE_API_BASE}${endpoint}`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body),
    signal
  });
  const data = await parseKieJson(res, "submit");
  if (!res.ok) {
    throw new Error(`Kie submit failed: ${res.status} ${JSON.stringify(data)}`);
  }
  const taskId = (data.data as Record<string, unknown>)?.taskId as string;
  if (!taskId) {
    throw new Error(`No taskId in Kie response: ${JSON.stringify(data)}`);
  }
  return taskId;
}

/** Poll the Suno record-info endpoint until the task reaches a terminal state. */
async function pollSuno(
  apiKey: string,
  taskId: string,
  pollInterval: number,
  maxAttempts: number,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const url = `${KIE_API_BASE}/api/v1/generate/record-info?taskId=${taskId}`;
  const failed = new Set([
    "CREATE_TASK_FAILED",
    "GENERATE_AUDIO_FAILED",
    "CALLBACK_EXCEPTION",
    "SENSITIVE_WORD_ERROR"
  ]);
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(url, { headers: headers(apiKey), signal });
    const data = await parseKieJson(res, "record-info");
    const status = (data.data as Record<string, unknown>)?.status as string;
    if (status === "SUCCESS") return data;
    if (failed.has(status)) {
      throw new Error(`Kie Suno task failed: ${status} (taskId: ${taskId})`);
    }
    await sleep(pollInterval, signal);
  }
  const timeoutSeconds = (maxAttempts * pollInterval) / 1000;
  throw new Error(
    `Kie Suno task timed out after ${timeoutSeconds}s (taskId: ${taskId}). ` +
      "The job may still complete on KIE — check record-info or the KIE dashboard."
  );
}

const KIE_MANIFEST_PKG = "@nodetool-ai/kie-nodes";
const KIE_MANIFEST_PATH = "kie-manifest.json";

export class KieProvider extends BaseProvider {
  private apiKey: string;

  static override requiredSecrets(): string[] {
    return ["KIE_API_KEY"];
  }

  constructor(secrets: Record<string, unknown> = {}) {
    super("kie");
    this.apiKey = (secrets["KIE_API_KEY"] as string) ?? "";
  }

  override getContainerEnv(): Record<string, string> {
    return { KIE_API_KEY: this.apiKey };
  }

  private requireApiKey(): string {
    if (!this.apiKey || !this.apiKey.trim()) {
      throw new Error("KIE_API_KEY is not configured");
    }
    return this.apiKey;
  }

  private makeOpenAIProvider(basePath: string): OpenAIProvider {
    return new OpenAIProvider(
      { OPENAI_API_KEY: this.requireApiKey() },
      {
        providerId: "kie",
        clientFactory: (apiKey) =>
          new OpenAI({
            apiKey,
            baseURL: `${KIE_API_BASE}${basePath}`
          })
      }
    );
  }

  private makeAnthropicProvider(basePath: string): AnthropicProvider {
    return new AnthropicProvider(
      { ANTHROPIC_API_KEY: this.requireApiKey() },
      {
        providerId: "kie",
        clientFactory: (apiKey) =>
          new Anthropic({
            authToken: apiKey,
            baseURL: `${KIE_API_BASE}${basePath}`
          })
      }
    );
  }

  private makeResponsesClient(basePath: string): OpenAI {
    return new OpenAI({
      apiKey: this.requireApiKey(),
      baseURL: `${KIE_API_BASE}${basePath}`
    });
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return KIE_CHAT_MODELS.map((model) => ({
      id: model.id,
      name: model.name,
      provider: "kie"
    }));
  }

  override async hasToolSupport(model: string): Promise<boolean> {
    return chatModel(model) !== undefined;
  }

  async generateMessage(
    args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    const model = chatModel(args.model);
    if (!model) {
      throw new Error(`Kie does not support chat model: ${args.model}`);
    }

    if (model.api === "openai") {
      return this.makeOpenAIProvider(model.basePath).generateMessage(args);
    }
    if (model.api === "anthropic") {
      return this.makeAnthropicProvider(model.basePath).generateMessage(args);
    }
    return this.generateResponseMessage(args, model.basePath);
  }

  async *generateMessages(
    args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    const model = chatModel(args.model);
    if (!model) {
      throw new Error(`Kie does not support chat model: ${args.model}`);
    }

    if (model.api === "openai") {
      yield* this.makeOpenAIProvider(model.basePath).generateMessages(args);
      return;
    }
    if (model.api === "anthropic") {
      yield* this.makeAnthropicProvider(model.basePath).generateMessages(args);
      return;
    }
    yield* this.generateResponseMessages(args, model.basePath);
  }

  private async generateResponseMessage(
    args: Parameters<BaseProvider["generateMessage"]>[0],
    basePath: string
  ): Promise<Message> {
    const client = this.makeResponsesClient(basePath);
    const request: Record<string, unknown> = {
      model: args.model,
      input: await messagesToResponsesInput(args.messages, (uri) =>
        this.resolveUri(uri)
      ),
      stream: false
    };

    if (args.maxTokens != null) request.max_output_tokens = args.maxTokens;
    if (args.temperature != null) request.temperature = args.temperature;
    if (args.topP != null) request.top_p = args.topP;

    const tools = responseTools(args.tools);
    if (tools.length > 0) {
      request.tools = tools;
      request.tool_choice = responseToolChoice(args.toolChoice) ?? "auto";
    }

    this.recordRequestPayload(request);
    const response = (await (client.responses.create as unknown as (
      body: Record<string, unknown>,
      options?: { signal?: AbortSignal }
    ) => Promise<Record<string, unknown>>).call(client.responses, request, {
      signal: args.signal
    })) as Record<string, unknown>;

    this.trackUsage(args.model, responseUsage(response));

    const outputText =
      typeof response.output_text === "string"
        ? response.output_text
        : extractResponsesText(response.output);
    const toolCalls = extractResponsesToolCalls(
      response.output,
      this.buildToolCall.bind(this)
    );

    return {
      role: "assistant",
      content: outputText || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }

  private async *generateResponseMessages(
    args: Parameters<BaseProvider["generateMessages"]>[0],
    basePath: string
  ): AsyncGenerator<ProviderStreamItem> {
    const client = this.makeResponsesClient(basePath);
    const request: Record<string, unknown> = {
      model: args.model,
      input: await messagesToResponsesInput(args.messages, (uri) =>
        this.resolveUri(uri)
      ),
      stream: true
    };

    if (args.maxTokens != null) request.max_output_tokens = args.maxTokens;
    if (args.temperature != null) request.temperature = args.temperature;
    if (args.topP != null) request.top_p = args.topP;

    const tools = responseTools(args.tools);
    if (tools.length > 0) {
      request.tools = tools;
      request.tool_choice = responseToolChoice(args.toolChoice) ?? "auto";
    }

    this.recordRequestPayload(request);
    const stream = (await (client.responses.create as unknown as (
      body: Record<string, unknown>,
      options?: { signal?: AbortSignal }
    ) => Promise<AsyncIterable<Record<string, unknown>>>).call(
      client.responses,
      request,
      { signal: args.signal }
    )) as AsyncIterable<Record<string, unknown>>;
    yield* streamResponsesEvents(stream, {
      model: args.model,
      buildToolCall: this.buildToolCall.bind(this),
      onUsage: (model, usage) => this.trackUsage(model, usage)
    });
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return loadVideoModels(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, "kie");
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return loadImageModels(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, "kie");
  }

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return loadTTSModels(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, "kie");
  }

  override async getAvailableMusicModels(): Promise<MusicModel[]> {
    return loadMusicModels(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, "kie");
  }

  /** Resolve poll interval and attempt count for a model's async task. */
  private pollConfig(
    modelId: string,
    timeoutSeconds?: number | null
  ): { pollInterval: number; maxAttempts: number } {
    const meta = getManifestNodeMeta(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, modelId);
    const pollInterval = meta?.pollInterval ?? 4000;
    // A caller-supplied timeout wins: translate it into a bounded poll window.
    if (timeoutSeconds != null && timeoutSeconds > 0) {
      const maxAttempts = Math.max(
        1,
        Math.ceil((timeoutSeconds * 1000) / pollInterval)
      );
      return { pollInterval, maxAttempts };
    }
    return { pollInterval, maxAttempts: meta?.maxAttempts ?? 300 };
  }

  private declaresField(fields: ModelInputField[], name: string): boolean {
    return fields.some((f) => f.name === name);
  }

  /**
   * Per-call timeout signal (mirrors the gemini provider): threaded into the
   * poll-loop fetches and sleeps so an expired budget aborts the in-flight
   * request promptly instead of leaking it until the loop exhausts.
   */
  private timeoutSignal(
    timeoutSeconds?: number | null
  ): AbortSignal | undefined {
    return timeoutSeconds && timeoutSeconds > 0
      ? AbortSignal.timeout(timeoutSeconds * 1000)
      : undefined;
  }

  /**
   * Generate music as an encoded audio file. The advertised KIE music models
   * (generate-music, generate-sounds) run through the Suno API — a separate
   * submit endpoint and record-info poll, not the generic jobs task API. A
   * music model without Suno metadata falls back to the generic jobs path.
   */
  override async textToMusic(
    params: TextToMusicParams
  ): Promise<EncodedAudioResult> {
    if (!params.prompt) throw new Error("Prompt is required");
    const apiKey = this.requireApiKey();
    const modelId = params.model.id;
    log.debug("Kie textToMusic", { model: modelId });

    const signal = this.timeoutSignal(params.timeoutSeconds);
    const meta = getManifestNodeMeta(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, modelId);
    if (meta?.useSuno && meta.sunoEndpoint) {
      const input = this.buildSunoInput(modelId, params);
      const taskId = await submitSuno(apiKey, meta.sunoEndpoint, input, signal);
      const { pollInterval, maxAttempts } = this.sunoPollConfig(
        meta.pollInterval,
        meta.maxAttempts,
        params.timeoutSeconds
      );
      if (getWebhookBaseUrl()) {
        const timeoutMs = pollInterval * maxAttempts;
        log.info("Waiting for KIE Suno webhook callback", { taskId, timeoutMs });
        await registerWebhookWait(taskId, timeoutMs, signal);
        // After webhook fires, fetch the record to download audio
        const url = `${KIE_API_BASE}/api/v1/generate/record-info?taskId=${taskId}`;
        const res = await fetch(url, { headers: headers(apiKey), signal });
        const record = await parseKieJson(res, "record-info");
        const bytes = await this.downloadSunoAudio(record, signal);
        return { data: bytes, mimeType: sniffAudioMime(bytes) };
      }
      const record = await pollSuno(
        apiKey,
        taskId,
        pollInterval,
        maxAttempts,
        signal
      );
      const bytes = await this.downloadSunoAudio(record, signal);
      return { data: bytes, mimeType: sniffAudioMime(bytes) };
    }

    // Fallback: a music model that doesn't route through Suno.
    const input: Record<string, unknown> = { prompt: params.prompt };
    if (params.lyrics) input.lyrics = params.lyrics;
    if (params.durationSeconds != null) {
      input.duration = Math.round(params.durationSeconds);
    }
    const { pollInterval, maxAttempts } = this.pollConfig(
      modelId,
      params.timeoutSeconds
    );
    const taskId = await submitTaskWithWebhook(apiKey, modelId, input, signal);
    await waitForCompletion(apiKey, taskId, pollInterval, maxAttempts, signal);
    const bytes = await downloadResultBytes(apiKey, taskId, signal);
    return { data: bytes, mimeType: sniffAudioMime(bytes) };
  }

  /** Poll interval/attempts for a Suno task, honoring a per-call timeout. */
  private sunoPollConfig(
    metaPollInterval: number | undefined,
    metaMaxAttempts: number | undefined,
    timeoutSeconds?: number | null
  ): { pollInterval: number; maxAttempts: number } {
    const pollInterval = metaPollInterval ?? 4000;
    if (timeoutSeconds != null && timeoutSeconds > 0) {
      return {
        pollInterval,
        maxAttempts: Math.max(1, Math.ceil((timeoutSeconds * 1000) / pollInterval))
      };
    }
    return { pollInterval, maxAttempts: metaMaxAttempts ?? 120 };
  }

  /**
   * Build the Suno submit body from the model's manifest fields. `generate-music`
   * distinguishes custom mode (lyrics supplied → prompt = lyrics, style = the
   * description) from non-custom mode (KIE auto-generates lyrics from the
   * prompt). Required fields with a usable default (e.g. `model`) are filled.
   */
  private buildSunoInput(
    modelId: string,
    params: TextToMusicParams
  ): Record<string, unknown> {
    const fields = getModelInputFields(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, modelId);
    const has = (name: string) => this.declaresField(fields, name);
    const input: Record<string, unknown> = {};

    if (params.lyrics && has("customMode") && has("style")) {
      input.customMode = true;
      input.prompt = params.lyrics;
      input.style = params.prompt;
      if (has("instrumental")) input.instrumental = false;
    } else {
      if (has("customMode")) input.customMode = false;
      input.prompt = params.prompt;
    }

    for (const f of fields) {
      if (f.required && input[f.name] === undefined) {
        const d = defaultForField(f);
        if (d !== undefined) input[f.name] = d;
      }
    }
    return input;
  }

  /** Download the first audio track from a Suno record-info response. */
  private async downloadSunoAudio(
    record: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<Uint8Array> {
    const response = (record.data as Record<string, unknown>)?.response as
      | Record<string, unknown>
      | undefined;
    const sunoData = response?.sunoData as
      | Array<Record<string, unknown>>
      | undefined;
    const audioUrl = sunoData?.[0]?.audioUrl as string | undefined;
    if (!audioUrl) throw new Error("No audioUrl in Kie Suno response");
    const dlRes = await safeFetch(audioUrl, { signal });
    if (!dlRes.ok) {
      throw new Error(`Failed to download from ${audioUrl}`);
    }
    return new Uint8Array(await dlRes.arrayBuffer());
  }

  /**
   * Generate speech as an encoded audio file. KIE runs TTS as an async job and
   * returns a result URL (mp3); the unified TTS node consumes this encoded path
   * rather than streaming PCM samples.
   */
  override async textToSpeechEncoded(args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
    audioFormat?: string;
  }): Promise<EncodedAudioResult | null> {
    if (!args.text) throw new Error("text must not be empty");
    const input: Record<string, unknown> = { text: args.text };
    if (args.voice) input.voice = args.voice;
    if (args.speed != null) input.speed = args.speed;

    log.debug("Kie textToSpeech", { model: args.model });
    const apiKey = this.requireApiKey();
    const { pollInterval, maxAttempts } = this.pollConfig(args.model);
    const taskId = await submitTaskWithWebhook(apiKey, args.model, input);
    await waitForCompletion(apiKey, taskId, pollInterval, maxAttempts);
    const bytes = await downloadResultBytes(apiKey, taskId);
    return { data: bytes, mimeType: sniffAudioMime(bytes) };
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt) throw new Error("Prompt is required");

    const modelId = params.model.id;
    const fields = getModelInputFields(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, modelId);
    const input: Record<string, unknown> = { prompt: params.prompt };
    if (params.aspectRatio) input.aspect_ratio = params.aspectRatio;
    this.applyVideoDuration(input, fields, params);

    log.debug("Kie textToVideo", { model: modelId });
    const apiKey = this.requireApiKey();
    const signal = this.timeoutSignal(params.timeoutSeconds);
    const { pollInterval, maxAttempts } = this.pollConfig(
      modelId,
      params.timeoutSeconds
    );
    const taskId = await submitTaskWithWebhook(apiKey, modelId, input, signal);
    await waitForCompletion(apiKey, taskId, pollInterval, maxAttempts, signal);
    return downloadResultBytes(apiKey, taskId, signal);
  }

  /**
   * Set the request `duration` from the caller's requested seconds (preferring
   * `durationSeconds`, falling back to `numFrames`/24), coerced to the model's
   * declared field type. A declared schema with no `duration` field sends
   * nothing; an unknown model keeps the historical numeric behavior.
   */
  private applyVideoDuration(
    input: Record<string, unknown>,
    fields: ModelInputField[],
    params: { durationSeconds?: number | null; numFrames?: number | null }
  ): void {
    const seconds =
      params.durationSeconds != null
        ? params.durationSeconds
        : params.numFrames != null
          ? params.numFrames / 24
          : undefined;
    if (seconds == null) return;

    if (fields.length === 0) {
      // Unknown model: derive a plain integer as before (ceil for a frame count,
      // round for an explicit second count).
      input.duration =
        params.durationSeconds != null ? Math.round(seconds) : Math.ceil(seconds);
      return;
    }
    const durationField = fields.find((f) => f.name === "duration");
    if (!durationField) return;
    input.duration = coerceDuration(durationField, seconds);
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt) throw new Error("Prompt is required");

    const modelId = params.model.id;
    const fields = getModelInputFields(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, modelId);
    const input: Record<string, unknown> = { prompt: params.prompt };

    // Schema-driven: only send fields the model declares. No KIE model declares
    // width/height, so those are never sent — an aspect ratio is derived instead.
    if (params.negativePrompt && this.declaresField(fields, "negative_prompt")) {
      input.negative_prompt = params.negativePrompt;
    }
    if (params.seed != null && this.declaresField(fields, "seed")) {
      input.seed = params.seed;
    }
    this.applyTextToImageAspect(input, fields, params);

    log.debug("Kie textToImage", { model: modelId });
    const apiKey = this.requireApiKey();
    const { pollInterval, maxAttempts } = this.pollConfig(modelId);
    const taskId = await submitTaskWithWebhook(apiKey, modelId, input);
    await waitForCompletion(apiKey, taskId, pollInterval, maxAttempts);
    return downloadResultBytes(apiKey, taskId);
  }

  /**
   * Set `aspect_ratio` when the model declares it: pass a caller-supplied ratio
   * through if it's a declared enum value (else snap to the nearest), or derive
   * the nearest declared ratio from width/height when no ratio was given.
   */
  private applyTextToImageAspect(
    input: Record<string, unknown>,
    fields: ModelInputField[],
    params: TextToImageParams
  ): void {
    const field = fields.find((f) => f.name === "aspect_ratio");
    if (!field) return;
    const enumValues = field.enumValues;

    if (params.aspectRatio) {
      if (enumValues && enumValues.length > 0) {
        input.aspect_ratio = enumValues.includes(params.aspectRatio)
          ? params.aspectRatio
          : nearestAspect(enumValues, aspectToNumber(params.aspectRatio) ?? 1);
      } else {
        input.aspect_ratio = params.aspectRatio;
      }
      return;
    }
    if (params.width && params.height && enumValues && enumValues.length > 0) {
      input.aspect_ratio = nearestAspect(enumValues, params.width / params.height);
    }
  }

  /**
   * Set the request's `negative_prompt` / `aspect_ratio` / `seed` from the
   * caller only when the model declares them. Unknown models (empty schema)
   * keep the historical behavior: send whatever the caller supplied under the
   * conventional names.
   */
  private applyEditOptions(
    input: Record<string, unknown>,
    fields: ModelInputField[],
    params: {
      negativePrompt?: string | null;
      aspectRatio?: string | null;
      seed?: number | null;
    }
  ): void {
    const declaredOrUnknown = (name: string) =>
      fields.length === 0 || this.declaresField(fields, name);
    if (params.negativePrompt && declaredOrUnknown("negative_prompt")) {
      input.negative_prompt = params.negativePrompt;
    }
    if (params.aspectRatio && declaredOrUnknown("aspect_ratio")) {
      input.aspect_ratio = params.aspectRatio;
    }
    if (params.seed != null && declaredOrUnknown("seed")) {
      input.seed = params.seed;
    }
  }

  /**
   * Edit/transform one or more source images. Uses the model's schema to route
   * the uploaded image(s) to the correct input field — single-image models
   * (`image_url`) and multi-image edit/composition models (`image_urls` /
   * `image_input`) are both supported.
   */
  override async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const apiKey = this.requireApiKey();
    const imageUrls = await this.uploadImages(apiKey, images);
    if (imageUrls.length === 0) {
      throw new Error("The input image is empty.");
    }

    const modelId = params.model.id;
    const fields = getModelInputFields(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, modelId);
    const input: Record<string, unknown> = {
      prompt: params.prompt,
      ...this.imageInput(modelId, imageUrls)
    };
    this.applyEditOptions(input, fields, params);

    log.debug("Kie imageToImage", { model: modelId, images: imageUrls.length });

    const { pollInterval, maxAttempts } = this.pollConfig(modelId);
    const taskId = await submitTaskWithWebhook(apiKey, modelId, input);
    await waitForCompletion(apiKey, taskId, pollInterval, maxAttempts);
    return downloadResultBytes(apiKey, taskId);
  }

  /**
   * Inpaint: regenerate the masked region of one or more source images. The
   * source image(s) route to the model's primary image field; the mask routes
   * to whatever mask field the model's schema declares (falling back to
   * `mask_url`).
   */
  override async inpaint(
    images: Uint8Array[],
    params: InpaintingParams
  ): Promise<Uint8Array> {
    const apiKey = this.requireApiKey();
    const imageUrls = await this.uploadImages(apiKey, images);
    if (imageUrls.length === 0) {
      throw new Error("The input image is empty.");
    }

    const modelId = params.model.id;
    const fields = getModelInputFields(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, modelId);
    const input: Record<string, unknown> = {
      prompt: params.prompt,
      ...this.imageInput(modelId, imageUrls)
    };
    this.applyEditOptions(input, fields, params);

    if (params.mask && params.mask.length > 0) {
      const [maskUrl] = await this.uploadImages(apiKey, [params.mask]);
      if (maskUrl) {
        const maskField = selectMaskImageInput(
          getModelImageInputs(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, modelId)
        );
        const fieldName = maskField?.apiName ?? "mask_url";
        input[fieldName] = maskField?.isList ? [maskUrl] : maskUrl;
      }
    }

    log.debug("Kie inpaint", { model: modelId, images: imageUrls.length });

    const { pollInterval, maxAttempts } = this.pollConfig(modelId);
    const taskId = await submitTaskWithWebhook(apiKey, modelId, input);
    await waitForCompletion(apiKey, taskId, pollInterval, maxAttempts);
    return downloadResultBytes(apiKey, taskId);
  }

  /**
   * Animate one or more source images into a video. The model schema decides
   * whether the frame goes to a single field (`image_url`) or a list.
   */
  override async imageToVideo(
    images: Uint8Array[],
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    const apiKey = this.requireApiKey();
    const signal = this.timeoutSignal(params.timeoutSeconds);
    const imageUrls = await this.uploadImages(apiKey, images, signal);
    if (imageUrls.length === 0) {
      throw new Error("The input image is empty.");
    }

    const modelId = params.model.id;
    const fields = getModelInputFields(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, modelId);
    const input: Record<string, unknown> = this.imageInput(modelId, imageUrls);
    if (params.prompt) input.prompt = params.prompt;
    this.applyEditOptions(input, fields, params);
    this.applyVideoDuration(input, fields, params);

    log.debug("Kie imageToVideo", { model: modelId, images: imageUrls.length });

    const { pollInterval, maxAttempts } = this.pollConfig(
      modelId,
      params.timeoutSeconds
    );
    const taskId = await submitTaskWithWebhook(apiKey, modelId, input, signal);
    await waitForCompletion(apiKey, taskId, pollInterval, maxAttempts, signal);
    return downloadResultBytes(apiKey, taskId, signal);
  }

  /**
   * Map uploaded image URLs to the model's declared input field. Single-image
   * models get `image_url` (string); multi-image models get `image_urls` /
   * `image_input` (array). Falls back to KIE's conventions for unknown models.
   */
  private imageInput(
    modelId: string,
    urls: string[]
  ): Record<string, unknown> {
    const field = selectPrimaryImageInput(
      getModelImageInputs(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, modelId),
      urls.length
    );
    if (field) {
      return { [field.apiName]: field.isList ? urls : urls[0] };
    }
    return urls.length === 1
      ? { image_url: urls[0] }
      : { image_urls: urls };
  }

  /** Upload every non-empty image to KIE's file store, returning hosted URLs. */
  private async uploadImages(
    apiKey: string,
    images: Uint8Array[],
    signal?: AbortSignal
  ): Promise<string[]> {
    const valid = images.filter((b) => b && b.length > 0);
    return Promise.all(valid.map((b) => uploadImageBytes(apiKey, b, signal)));
  }
}
