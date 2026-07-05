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
  selectPrimaryImageInput,
  selectMaskImageInput
} from "./manifest-models.js";
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

/**
 * Upload raw image bytes to KIE's file store and return the hosted URL.
 * Mirrors the upload flow used by the KIE factory nodes (multipart POST →
 * `downloadUrl`).
 */
async function uploadImageBytes(
  apiKey: string,
  bytes: Uint8Array
): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: "image/png" }),
    `upload-${Date.now()}.png`
  );
  form.append("uploadPath", "images/user-uploads");
  form.append("fileName", `upload-${Date.now()}.png`);
  const res = await fetch(KIE_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  const data = (await res.json()) as Record<string, unknown>;
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
  input: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`${KIE_API_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({ model, input })
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Kie submit failed: ${res.status} ${JSON.stringify(data)}`);
  }
  const taskId = (data.data as Record<string, unknown>)?.taskId as string;
  if (!taskId) {
    throw new Error(`No taskId in Kie response: ${JSON.stringify(data)}`);
  }
  return taskId;
}

async function pollUntilDone(
  apiKey: string,
  taskId: string,
  pollInterval = 4000,
  maxAttempts = 300
): Promise<void> {
  const url = `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(url, { headers: headers(apiKey) });
    const data = (await res.json()) as Record<string, unknown>;
    const state = (data.data as Record<string, unknown>)?.state as string;
    if (state === "success") return;
    if (state === "failed" || state === "fail") {
      const msg =
        (data.data as Record<string, unknown>)?.failMsg || "Unknown error";
      throw new Error(`Kie task failed: ${msg} (taskId: ${taskId})`);
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  const timeoutSeconds = (maxAttempts * pollInterval) / 1000;
  throw new Error(
    `Kie task timed out after ${timeoutSeconds}s (taskId: ${taskId}). ` +
      "The job may still complete on KIE — check recordInfo or the KIE dashboard."
  );
}

async function downloadResultBytes(
  apiKey: string,
  taskId: string
): Promise<Uint8Array> {
  const url = `${KIE_API_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`;
  const res = await fetch(url, { headers: headers(apiKey) });
  if (!res.ok) throw new Error(`Failed to get Kie result: ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  const resultJsonStr = (data.data as Record<string, unknown>)
    ?.resultJson as string;
  if (!resultJsonStr) throw new Error("No resultJson in Kie response");
  const resultData = JSON.parse(resultJsonStr) as Record<string, unknown>;
  const resultUrls = resultData.resultUrls as string[];
  if (!resultUrls?.length) throw new Error("No resultUrls in Kie resultJson");
  const dlRes = await safeFetch(resultUrls[0]);
  if (!dlRes.ok) {
    throw new Error(`Failed to download from ${resultUrls[0]}`);
  }
  return new Uint8Array(await dlRes.arrayBuffer());
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
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: this.requireApiKey() },
      {
        clientFactory: (apiKey) =>
          new OpenAI({
            apiKey,
            baseURL: `${KIE_API_BASE}${basePath}`
          })
      }
    );
    (provider as { provider: string }).provider = "kie";
    return provider;
  }

  private makeAnthropicProvider(basePath: string): AnthropicProvider {
    const provider = new AnthropicProvider(
      { ANTHROPIC_API_KEY: this.requireApiKey() },
      {
        clientFactory: (apiKey) =>
          new Anthropic({
            authToken: apiKey,
            baseURL: `${KIE_API_BASE}${basePath}`
          })
      }
    );
    (provider as { provider: string }).provider = "kie";
    return provider;
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

  /**
   * Generate music as an encoded audio file. KIE runs music generation (Suno)
   * as an async job and returns a result URL, so this mirrors the TTS / video
   * path: submit the task, poll until done, then download the audio bytes.
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

    const modelId = params.model.id;
    log.debug("Kie textToMusic", { model: modelId });
    const apiKey = this.requireApiKey();
    const taskId = await submitTask(apiKey, modelId, input);
    await pollUntilDone(apiKey, taskId);
    const bytes = await downloadResultBytes(apiKey, taskId);
    return { data: bytes, mimeType: sniffAudioMime(bytes) };
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
    const taskId = await submitTask(apiKey, args.model, input);
    await pollUntilDone(apiKey, taskId);
    const bytes = await downloadResultBytes(apiKey, taskId);
    return { data: bytes, mimeType: sniffAudioMime(bytes) };
  }

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt) throw new Error("Prompt is required");

    const input: Record<string, unknown> = { prompt: params.prompt };
    if (params.aspectRatio) input.aspect_ratio = params.aspectRatio;
    if (params.numFrames) {
      input.duration = Math.ceil(params.numFrames / 24);
    }

    const modelId = params.model.id;
    log.debug("Kie textToVideo", { model: modelId });

    const taskId = await submitTask(this.requireApiKey(), modelId, input);
    await pollUntilDone(this.requireApiKey(), taskId);
    return downloadResultBytes(this.requireApiKey(), taskId);
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const input: Record<string, unknown> = { prompt: params.prompt };
    if (params.width) input.width = params.width;
    if (params.height) input.height = params.height;

    const modelId = params.model.id;
    log.debug("Kie textToImage", { model: modelId });

    const taskId = await submitTask(this.requireApiKey(), modelId, input);
    await pollUntilDone(this.requireApiKey(), taskId);
    return downloadResultBytes(this.requireApiKey(), taskId);
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

    const input: Record<string, unknown> = {
      prompt: params.prompt,
      ...this.imageInput(params.model.id, imageUrls)
    };
    if (params.negativePrompt) input.negative_prompt = params.negativePrompt;
    if (params.aspectRatio) input.aspect_ratio = params.aspectRatio;

    const modelId = params.model.id;
    log.debug("Kie imageToImage", { model: modelId, images: imageUrls.length });

    const taskId = await submitTask(apiKey, modelId, input);
    await pollUntilDone(apiKey, taskId);
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

    const input: Record<string, unknown> = {
      prompt: params.prompt,
      ...this.imageInput(params.model.id, imageUrls)
    };
    if (params.negativePrompt) input.negative_prompt = params.negativePrompt;
    if (params.aspectRatio) input.aspect_ratio = params.aspectRatio;

    if (params.mask && params.mask.length > 0) {
      const [maskUrl] = await this.uploadImages(apiKey, [params.mask]);
      if (maskUrl) {
        const maskField = selectMaskImageInput(
          getModelImageInputs(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, params.model.id)
        );
        const fieldName = maskField?.apiName ?? "mask_url";
        input[fieldName] = maskField?.isList ? [maskUrl] : maskUrl;
      }
    }

    const modelId = params.model.id;
    log.debug("Kie inpaint", { model: modelId, images: imageUrls.length });

    const taskId = await submitTask(apiKey, modelId, input);
    await pollUntilDone(apiKey, taskId);
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
    const imageUrls = await this.uploadImages(apiKey, images);
    if (imageUrls.length === 0) {
      throw new Error("The input image is empty.");
    }

    const input: Record<string, unknown> = this.imageInput(
      params.model.id,
      imageUrls
    );
    if (params.prompt) input.prompt = params.prompt;
    if (params.negativePrompt) input.negative_prompt = params.negativePrompt;
    if (params.aspectRatio) input.aspect_ratio = params.aspectRatio;
    if (params.durationSeconds) {
      input.duration = Math.ceil(params.durationSeconds);
    }

    const modelId = params.model.id;
    log.debug("Kie imageToVideo", { model: modelId, images: imageUrls.length });

    const taskId = await submitTask(apiKey, modelId, input);
    await pollUntilDone(apiKey, taskId);
    return downloadResultBytes(apiKey, taskId);
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
    images: Uint8Array[]
  ): Promise<string[]> {
    const valid = images.filter((b) => b && b.length > 0);
    return Promise.all(valid.map((b) => uploadImageBytes(apiKey, b)));
  }
}
