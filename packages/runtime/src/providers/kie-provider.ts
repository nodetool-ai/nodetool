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
import type { Chunk } from "@nodetool-ai/protocol";
import { BaseProvider } from "./base-provider.js";
import { createLogger } from "@nodetool-ai/config";
import type {
  ImageModel,
  LanguageModel,
  Message,
  MessageContent,
  MessageImageContent,
  MessageTextContent,
  ProviderStreamItem,
  ProviderTool,
  TextToImageParams,
  TextToVideoParams,
  ToolCall,
  VideoModel
} from "./types.js";
import { loadVideoModels, loadImageModels } from "./manifest-models.js";
import { OpenAIProvider } from "./openai-provider.js";
import { AnthropicProvider } from "./anthropic-provider.js";

const log = createLogger("nodetool.runtime.providers.kie");

const KIE_API_BASE = "https://api.kie.ai";

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
      throw new Error(`Kie task failed: ${msg}`);
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  throw new Error(`Kie task timed out after ${maxAttempts * pollInterval}ms`);
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
  const dlRes = await fetch(resultUrls[0]);
  if (!dlRes.ok) {
    throw new Error(`Failed to download from ${resultUrls[0]}`);
  }
  return new Uint8Array(await dlRes.arrayBuffer());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringifyContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return JSON.stringify(value);
}

function dataUri(mimeType: string, data: Uint8Array | string): string {
  if (typeof data === "string" && data.startsWith("data:")) return data;
  const base64 =
    typeof data === "string" ? data : Buffer.from(data).toString("base64");
  return `data:${mimeType};base64,${base64}`;
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

  private async responseInputContent(
    content: MessageContent
  ): Promise<Record<string, unknown> | null> {
    if (content.type === "text") {
      return { type: "input_text", text: (content as MessageTextContent).text };
    }

    if (content.type === "image_url") {
      const image = (content as MessageImageContent).image;
      if (image.uri) {
        const resolved = await this.resolveUri(image.uri);
        return { type: "input_image", image_url: resolved };
      }
      if (image.data) {
        return {
          type: "input_image",
          image_url: dataUri(image.mimeType ?? "image/jpeg", image.data)
        };
      }
    }

    return null;
  }

  private async messagesToResponsesInput(
    messages: Message[]
  ): Promise<Array<Record<string, unknown>>> {
    const input: Array<Record<string, unknown>> = [];

    for (const message of messages) {
      if (message.role === "tool") {
        input.push({
          type: "function_call_output",
          call_id: message.toolCallId ?? "",
          output: stringifyContent(message.content)
        });
        continue;
      }

      if (message.role === "assistant") {
        const text = stringifyContent(message.content);
        if (text) {
          input.push({
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text }]
          });
        }
        for (const toolCall of message.toolCalls ?? []) {
          input.push({
            type: "function_call",
            id: toolCall.id,
            call_id: toolCall.id,
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.args ?? {})
          });
        }
        continue;
      }

      const content: Array<Record<string, unknown>> = [];
      if (typeof message.content === "string") {
        content.push({ type: "input_text", text: message.content });
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          const converted = await this.responseInputContent(part);
          if (converted) content.push(converted);
        }
      }

      if (content.length === 0) continue;
      input.push({ role: message.role, content });
    }

    return input;
  }

  private responseTools(tools: ProviderTool[] = []): Array<Record<string, unknown>> {
    return tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.inputSchema ?? { type: "object", properties: {} }
    }));
  }

  private responseToolChoice(
    toolChoice: string | "any" | undefined
  ): unknown {
    if (!toolChoice) return undefined;
    if (toolChoice === "any") return "auto";
    return { type: "function", name: toolChoice };
  }

  private async generateResponseMessage(
    args: Parameters<BaseProvider["generateMessage"]>[0],
    basePath: string
  ): Promise<Message> {
    const client = this.makeResponsesClient(basePath);
    const request: Record<string, unknown> = {
      model: args.model,
      input: await this.messagesToResponsesInput(args.messages),
      stream: false
    };

    if (args.maxTokens != null) request.max_output_tokens = args.maxTokens;
    if (args.temperature != null) request.temperature = args.temperature;
    if (args.topP != null) request.top_p = args.topP;

    const tools = this.responseTools(args.tools);
    if (tools.length > 0) {
      request.tools = tools;
      request.tool_choice = this.responseToolChoice(args.toolChoice) ?? "auto";
    }

    const response = (await (client.responses.create as unknown as (
      body: Record<string, unknown>,
      options?: { signal?: AbortSignal }
    ) => Promise<Record<string, unknown>>).call(client.responses, request, {
      signal: args.signal
    })) as Record<string, unknown>;

    this.trackResponseUsage(args.model, response);

    const outputText =
      typeof response.output_text === "string"
        ? response.output_text
        : this.extractResponsesText(response.output);
    const toolCalls = this.extractResponsesToolCalls(response.output);

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
      input: await this.messagesToResponsesInput(args.messages),
      stream: true
    };

    if (args.maxTokens != null) request.max_output_tokens = args.maxTokens;
    if (args.temperature != null) request.temperature = args.temperature;
    if (args.topP != null) request.top_p = args.topP;

    const tools = this.responseTools(args.tools);
    if (tools.length > 0) {
      request.tools = tools;
      request.tool_choice = this.responseToolChoice(args.toolChoice) ?? "auto";
    }

    const stream = (await (client.responses.create as unknown as (
      body: Record<string, unknown>,
      options?: { signal?: AbortSignal }
    ) => Promise<AsyncIterable<Record<string, unknown>>>).call(
      client.responses,
      request,
      { signal: args.signal }
    )) as AsyncIterable<Record<string, unknown>>;
    const pendingArgs = new Map<string, string>();

    for await (const event of stream) {
      const type = event.type;
      if (type === "response.output_text.delta") {
        const chunk: Chunk = {
          type: "chunk",
          content: String(event.delta ?? ""),
          done: false
        };
        yield chunk;
        continue;
      }

      if (type === "response.function_call_arguments.delta") {
        const itemId = String(event.item_id ?? "");
        pendingArgs.set(itemId, (pendingArgs.get(itemId) ?? "") + String(event.delta ?? ""));
        continue;
      }

      if (type === "response.function_call_arguments.done") {
        const itemId = String(event.item_id ?? "");
        const argsText = String(event.arguments ?? pendingArgs.get(itemId) ?? "{}");
        pendingArgs.delete(itemId);
        yield this.buildToolCall(itemId, String(event.name ?? ""), argsText);
        continue;
      }

      if (type === "response.completed") {
        const response = event.response;
        if (isRecord(response)) this.trackResponseUsage(args.model, response);
        const chunk: Chunk = { type: "chunk", content: "", done: true };
        yield chunk;
        continue;
      }

      if (type === "response.failed" || type === "response.error") {
        throw new Error(`Kie responses stream failed: ${JSON.stringify(event)}`);
      }
    }
  }

  private extractResponsesText(output: unknown): string {
    if (!Array.isArray(output)) return "";
    const parts: string[] = [];
    for (const item of output) {
      if (!isRecord(item) || item.type !== "message" || !Array.isArray(item.content)) {
        continue;
      }
      for (const content of item.content) {
        if (isRecord(content) && content.type === "output_text") {
          parts.push(String(content.text ?? ""));
        }
      }
    }
    return parts.join("");
  }

  private extractResponsesToolCalls(output: unknown): ToolCall[] {
    if (!Array.isArray(output)) return [];
    const toolCalls: ToolCall[] = [];
    for (const item of output) {
      if (!isRecord(item) || item.type !== "function_call") continue;
      toolCalls.push(
        this.buildToolCall(
          String(item.call_id ?? item.id ?? ""),
          String(item.name ?? ""),
          item.arguments
        )
      );
    }
    return toolCalls;
  }

  private trackResponseUsage(model: string, response: Record<string, unknown>): void {
    const usage = response.usage;
    if (!isRecord(usage)) return;
    const inputTokens = Number(usage.input_tokens ?? 0);
    const outputTokens = Number(usage.output_tokens ?? 0);
    const details = usage.input_tokens_details;
    const cachedTokens = isRecord(details) ? Number(details.cached_tokens ?? 0) : 0;
    this.trackUsage(model, {
      inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
      outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
      cachedTokens: Number.isFinite(cachedTokens) ? cachedTokens : 0
    });
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return loadVideoModels(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, "kie");
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return loadImageModels(KIE_MANIFEST_PKG, KIE_MANIFEST_PATH, "kie");
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
}
