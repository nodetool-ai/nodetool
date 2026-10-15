import { PROVIDER_IDS, isRecord, isString } from "@nodetool-ai/protocol";
import { BaseProvider, type ProviderCapability } from "./base-provider.js";
import {
  decodeEventStream,
  signAwsRequest,
  type AwsCredentials
} from "./bedrock-transport.js";
import { sniffImageMime } from "./image-mime.js";
import { safeFetch } from "./safe-url.js";
import type {
  AnthropicThinkingBlock,
  ImageModel,
  LanguageModel,
  Message,
  MessageContent,
  ProviderStreamItem,
  ProviderThinkingConfig,
  ProviderTool,
  TextToImageParams,
  ToolCall
} from "./types.js";

const DEFAULT_REGION = "us-east-1";
const REGION_PATTERN = /^[a-z]{2}(-[a-z]+)+-\d+$/;
const SERVICE = "bedrock";
const DEFAULT_MAX_TOKENS = 4096;

const IMAGE_FORMATS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/gif": "gif",
  "image/webp": "webp"
};

const DOCUMENT_FORMATS: Record<string, string> = {
  "application/pdf": "pdf",
  "text/csv": "csv",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/html": "html",
  "text/plain": "txt",
  "text/markdown": "md"
};

/** Event-stream exception types and the HTTP status Bedrock documents for each. */
const STREAM_EXCEPTION_STATUS: Record<string, number> = {
  throttlingException: 429,
  validationException: 400,
  accessDeniedException: 403,
  modelStreamErrorException: 424,
  modelTimeoutException: 408,
  serviceUnavailableException: 503,
  internalServerException: 500
};

/** Image model families whose InvokeModel request shape this provider knows. */
type ImageFamily = "amazon" | "stability";

function imageFamily(modelId: string): ImageFamily | null {
  const id = modelId.toLowerCase();
  if (/amazon\.(nova-canvas|titan-image)/.test(id)) return "amazon";
  if (/stability\./.test(id)) return "stability";
  return null;
}

type ConverseBlock = Record<string, unknown>;
interface ConverseMessage {
  role: "user" | "assistant";
  content: ConverseBlock[];
}

function toBytes(data: Uint8Array | string): { bytes: Uint8Array; mime?: string } {
  if (data instanceof Uint8Array) return { bytes: data };
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(data);
  if (match) {
    const payload = match[2]
      ? Buffer.from(match[3], "base64")
      : Buffer.from(decodeURIComponent(match[3]), "utf8");
    return { bytes: new Uint8Array(payload), mime: match[1] };
  }
  return { bytes: new Uint8Array(Buffer.from(data, "base64")) };
}

function textOf(content: Message["content"]): string {
  if (content == null) return "";
  if (isString(content)) return content;
  return content
    .filter((part): part is Extract<MessageContent, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

/** Bedrock document names allow letters, digits, spaces, hyphens, parentheses and brackets. */
function documentName(title: string | undefined, index: number): string {
  const cleaned = (title ?? "")
    .replace(/[^A-Za-z0-9\s\-()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || `document ${index + 1}`;
}

function thinkingFields(
  model: string,
  thinking: ProviderThinkingConfig | undefined
): Record<string, unknown> | undefined {
  if (!thinking || thinking.type === "disabled") return undefined;
  if (!model.toLowerCase().includes("anthropic.")) return undefined;
  if (thinking.type === "adaptive") return { thinking: { type: "adaptive" } };
  return { thinking: { type: "enabled", budget_tokens: thinking.budgetTokens } };
}

function reasoningBlocks(blocks: AnthropicThinkingBlock[] | undefined): ConverseBlock[] {
  return (blocks ?? []).map((block) =>
    block.type === "thinking"
      ? { reasoningContent: { reasoningText: { text: block.thinking, signature: block.signature } } }
      : { reasoningContent: { redactedContent: block.data } }
  );
}

/** Read a Converse response's reasoning blocks back into the shape the agent loop carries between turns. */
function thinkingBlocksOf(content: ConverseBlock[]): AnthropicThinkingBlock[] {
  const blocks: AnthropicThinkingBlock[] = [];
  for (const block of content) {
    const reasoning = block.reasoningContent;
    if (!isRecord(reasoning)) continue;
    const text = reasoning.reasoningText;
    if (isRecord(text) && isString(text.text)) {
      blocks.push({
        type: "thinking",
        thinking: text.text,
        signature: isString(text.signature) ? text.signature : ""
      });
    } else if (isString(reasoning.redactedContent)) {
      blocks.push({ type: "redacted_thinking", data: reasoning.redactedContent });
    }
  }
  return blocks;
}

interface BedrockProviderOptions {
  fetchFn?: typeof fetch;
  now?: () => Date;
}

interface ConverseUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheWriteInputTokens?: number;
}

/**
 * Amazon Bedrock. Chat runs through the Converse API, which speaks one request
 * shape for every Bedrock chat model: Claude, Llama, Mistral, Nova and the
 * rest. Image generation runs through InvokeModel for Amazon Nova Canvas,
 * Titan Image and Stability models.
 *
 * Requests are signed with SigV4 from an IAM access key. Models are listed
 * from the region's foundation models and cross-region inference profiles
 * (`eu.anthropic.claude-…`), or from `BEDROCK_MODEL_IDS` when set.
 */
export class BedrockProvider extends BaseProvider {
  static override requiredSecrets(): string[] {
    return ["BEDROCK_ACCESS_KEY_ID", "BEDROCK_SECRET_ACCESS_KEY"];
  }

  readonly region: string;
  private readonly credentials: AwsCredentials;
  private readonly modelIds: string[];
  private readonly _fetch: typeof fetch;
  private readonly now: () => Date;
  private listing: Promise<{ language: LanguageModel[]; image: ImageModel[] }> | null = null;

  constructor(
    secrets: {
      BEDROCK_ACCESS_KEY_ID?: string;
      BEDROCK_SECRET_ACCESS_KEY?: string;
      BEDROCK_SESSION_TOKEN?: string;
      BEDROCK_REGION?: string;
      BEDROCK_MODEL_IDS?: string;
    },
    options: BedrockProviderOptions = {}
  ) {
    super(PROVIDER_IDS.BEDROCK);
    const accessKeyId = secrets.BEDROCK_ACCESS_KEY_ID?.trim();
    const secretAccessKey = secrets.BEDROCK_SECRET_ACCESS_KEY?.trim();
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("BEDROCK_ACCESS_KEY_ID and BEDROCK_SECRET_ACCESS_KEY are required");
    }
    this.region = secrets.BEDROCK_REGION?.trim() || DEFAULT_REGION;
    this.credentials = {
      accessKeyId,
      secretAccessKey,
      sessionToken: secrets.BEDROCK_SESSION_TOKEN?.trim() || undefined
    };
    this.modelIds = (secrets.BEDROCK_MODEL_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    this._fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? (() => new Date());
  }

  override getContainerEnv(): Record<string, string> {
    const env: Record<string, string> = {
      BEDROCK_ACCESS_KEY_ID: this.credentials.accessKeyId,
      BEDROCK_SECRET_ACCESS_KEY: this.credentials.secretAccessKey,
      BEDROCK_REGION: this.region
    };
    if (this.credentials.sessionToken) {
      env.BEDROCK_SESSION_TOKEN = this.credentials.sessionToken;
    }
    return env;
  }

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["text_to_image"];
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  private async request(
    host: "bedrock" | "bedrock-runtime",
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<Response> {
    // The region becomes part of the host name, so it must be a region and
    // nothing else.
    if (!REGION_PATTERN.test(this.region)) {
      throw new Error(`BEDROCK_REGION is not an AWS region: ${this.region}`);
    }
    const url = new URL(`https://${host}.${this.region}.amazonaws.com${path}`);
    const payload = body === undefined ? "" : JSON.stringify(body);
    const headers = signAwsRequest({
      method,
      url,
      body: payload,
      region: this.region,
      service: SERVICE,
      credentials: this.credentials,
      headers: body === undefined ? { accept: "application/json" } : { "content-type": "application/json", accept: "application/json" },
      now: this.now()
    });
    const response = await this._fetch(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : payload,
      signal
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let message = text;
      try {
        const parsed: unknown = JSON.parse(text);
        if (isRecord(parsed) && isString(parsed.message)) message = parsed.message;
        else if (isRecord(parsed) && isString(parsed.Message)) message = parsed.Message;
      } catch {
        // Not JSON: keep the raw body as the message.
      }
      throw new Error(`Bedrock error ${response.status}: ${message || response.statusText}`);
    }
    return response;
  }

  private modelPath(model: string, action: string): string {
    return `/model/${encodeURIComponent(model)}/${action}`;
  }

  // ── Model discovery ────────────────────────────────────────────────

  private async listModels(): Promise<{ language: LanguageModel[]; image: ImageModel[] }> {
    if (this.modelIds.length > 0) {
      return {
        language: this.modelIds
          .filter((id) => !imageFamily(id))
          .map((id) => ({ id, name: id, provider: this.provider })),
        image: this.modelIds
          .filter((id) => imageFamily(id))
          .map((id) => ({ id, name: id, provider: this.provider, supportedTasks: ["text_to_image"] }))
      };
    }
    this.listing ??= this.fetchModelListing().catch((error: unknown) => {
      this.listing = null;
      throw error;
    });
    return this.listing;
  }

  private async fetchModelListing(): Promise<{ language: LanguageModel[]; image: ImageModel[] }> {
    const foundation = await (await this.request("bedrock", "GET", "/foundation-models")).json() as {
      modelSummaries?: Array<{
        modelId?: string;
        modelName?: string;
        providerName?: string;
        outputModalities?: string[];
        inferenceTypesSupported?: string[];
        modelLifecycle?: { status?: string };
      }>;
    };
    const summaries = (foundation.modelSummaries ?? []).filter(
      (m) => isString(m.modelId) && m.modelLifecycle?.status !== "LEGACY"
    );
    const textModels = new Set(
      summaries.filter((m) => m.outputModalities?.includes("TEXT")).map((m) => m.modelId as string)
    );
    const label = (m: (typeof summaries)[number]) =>
      [m.providerName, m.modelName].filter(Boolean).join(" ") || (m.modelId as string);

    const language: LanguageModel[] = summaries
      .filter((m) => textModels.has(m.modelId as string) && m.inferenceTypesSupported?.includes("ON_DEMAND"))
      .map((m) => ({ id: m.modelId as string, name: label(m), provider: this.provider }));

    const image: ImageModel[] = summaries
      .filter(
        (m) =>
          m.outputModalities?.includes("IMAGE") &&
          m.inferenceTypesSupported?.includes("ON_DEMAND") &&
          imageFamily(m.modelId as string)
      )
      .map((m) => ({
        id: m.modelId as string,
        name: label(m),
        provider: this.provider,
        supportedTasks: ["text_to_image"]
      }));

    let nextToken: string | undefined;
    do {
      const query = new URLSearchParams({ typeEquals: "SYSTEM_DEFINED", maxResults: "1000" });
      if (nextToken) query.set("nextToken", nextToken);
      const page = await (await this.request("bedrock", "GET", `/inference-profiles?${query}`)).json() as {
        inferenceProfileSummaries?: Array<{
          inferenceProfileId?: string;
          inferenceProfileName?: string;
          status?: string;
          models?: Array<{ modelArn?: string }>;
        }>;
        nextToken?: string;
      };
      for (const profile of page.inferenceProfileSummaries ?? []) {
        if (!isString(profile.inferenceProfileId) || profile.status === "INACTIVE") continue;
        const servesText = (profile.models ?? []).some((m) =>
          textModels.has(String(m.modelArn ?? "").split("/").pop() ?? "")
        );
        if (!servesText) continue;
        language.push({
          id: profile.inferenceProfileId,
          name: profile.inferenceProfileName || profile.inferenceProfileId,
          provider: this.provider
        });
      }
      nextToken = page.nextToken || undefined;
    } while (nextToken);

    return { language, image };
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    try {
      return (await this.listModels()).language;
    } catch {
      // A failed listing (bad key, missing bedrock:ListFoundationModels
      // permission, offline) leaves the picker empty instead of failing discovery.
      return [];
    }
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    try {
      return (await this.listModels()).image;
    } catch {
      // Same as the language listing: discovery never throws.
      return [];
    }
  }

  // ── Converse request building ──────────────────────────────────────

  private async mediaBytes(
    source: { uri?: string; data?: Uint8Array | string; mimeType?: string },
    signal?: AbortSignal
  ): Promise<{ bytes: Uint8Array; mime?: string }> {
    const hasData =
      source.data !== undefined &&
      (source.data instanceof Uint8Array ? source.data.length > 0 : source.data.length > 0);
    if (hasData) {
      const decoded = toBytes(source.data as Uint8Array | string);
      return { bytes: decoded.bytes, mime: source.mimeType ?? decoded.mime };
    }
    const uri = source.uri ?? "";
    if (uri.startsWith("data:")) {
      const decoded = toBytes(uri);
      return { bytes: decoded.bytes, mime: source.mimeType ?? decoded.mime };
    }
    if (/^https?:\/\//i.test(uri)) {
      const response = await safeFetch(uri, signal ? { signal } : undefined, 5, this._fetch);
      if (!response.ok) throw new Error(`Failed to fetch ${uri}: ${response.status}`);
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        mime: source.mimeType ?? response.headers.get("content-type")?.split(";")[0] ?? undefined
      };
    }
    throw new Error("Bedrock media content needs inline data, a data: URI, or an https URL");
  }

  private async convertParts(
    content: Message["content"],
    signal?: AbortSignal
  ): Promise<ConverseBlock[]> {
    if (content == null) return [];
    if (isString(content)) return content ? [{ text: content }] : [];
    const blocks: ConverseBlock[] = [];
    let documents = 0;
    for (const part of content) {
      if (part.type === "text") {
        if (part.text) blocks.push({ text: part.text });
      } else if (part.type === "image_url") {
        const { bytes, mime } = await this.mediaBytes(part.image, signal);
        const format = IMAGE_FORMATS[sniffImageMime(bytes) ?? mime ?? ""];
        if (!format) throw new Error("Bedrock accepts PNG, JPEG, GIF or WebP images");
        blocks.push({ image: { format, source: { bytes: Buffer.from(bytes).toString("base64") } } });
      } else if (part.type === "document") {
        const { bytes, mime } = await this.mediaBytes(part.document, signal);
        const format = DOCUMENT_FORMATS[mime ?? ""];
        if (!format) throw new Error(`Bedrock does not accept documents of type ${mime ?? "unknown"}`);
        blocks.push({
          document: {
            format,
            name: documentName(part.document.title, documents++),
            source: { bytes: Buffer.from(bytes).toString("base64") }
          }
        });
      } else {
        throw new Error(`Bedrock chat does not accept ${part.type} content`);
      }
    }
    return blocks;
  }

  private async buildMessages(
    messages: Message[],
    signal?: AbortSignal
  ): Promise<{ system: ConverseBlock[]; messages: ConverseMessage[] }> {
    const system: ConverseBlock[] = [];
    const out: ConverseMessage[] = [];
    const push = (role: ConverseMessage["role"], content: ConverseBlock[]) => {
      if (content.length === 0) return;
      const last = out.at(-1);
      // Converse requires alternating roles: parallel tool results and
      // back-to-back user turns merge into one message.
      if (last?.role === role) last.content.push(...content);
      else out.push({ role, content });
    };

    for (const message of messages) {
      if (message.role === "system") {
        const text = textOf(message.content);
        if (text) system.push({ text });
      } else if (message.role === "user") {
        push("user", await this.convertParts(message.content, signal));
      } else if (message.role === "assistant") {
        const blocks: ConverseBlock[] = [];
        if (message.toolCalls?.length) {
          blocks.push(...reasoningBlocks(message._anthropicThinkingBlocks));
        }
        const text = textOf(message.content);
        if (text) blocks.push({ text });
        for (const call of message.toolCalls ?? []) {
          blocks.push({ toolUse: { toolUseId: call.id, name: call.name, input: call.args } });
        }
        push("assistant", blocks);
      } else if (message.role === "tool") {
        const parts = isString(message.content)
          ? [{ text: message.content || "(empty)" }]
          : await this.convertParts(message.content, signal);
        push("user", [
          {
            toolResult: {
              toolUseId: message.toolCallId ?? "",
              content: parts.length > 0 ? parts : [{ text: "(empty)" }],
              status: message.isError ? "error" : "success"
            }
          }
        ]);
      }
    }
    return { system, messages: out };
  }

  private toolConfig(tools: ProviderTool[] | undefined, toolChoice: string | undefined) {
    const specs = (tools ?? []).filter((tool) => tool.type !== "code_interpreter");
    if (specs.length === 0) return undefined;
    let choice: Record<string, unknown> = { auto: {} };
    if (toolChoice === "any") choice = { any: {} };
    else if (toolChoice && specs.some((tool) => tool.name === toolChoice)) {
      choice = { tool: { name: toolChoice } };
    }
    return {
      tools: specs.map((tool) => ({
        toolSpec: {
          name: tool.name,
          description: tool.description || tool.name,
          inputSchema: { json: tool.inputSchema ?? { type: "object", properties: {} } }
        }
      })),
      toolChoice: choice
    };
  }

  private async buildRequest(args: Parameters<BaseProvider["generateMessages"]>[0]) {
    const { system, messages } = await this.buildMessages(args.messages, args.signal);
    const inferenceConfig: Record<string, unknown> = {
      maxTokens: args.maxTokens ?? DEFAULT_MAX_TOKENS
    };
    const additional = thinkingFields(args.model, args.thinking);
    if (additional) {
      if (args.toolChoice && args.toolChoice !== "auto" && args.tools?.some((tool) =>
        tool.type !== "code_interpreter" && (args.toolChoice === "any" || args.toolChoice === tool.name))) {
        throw new Error("Bedrock thinking does not support forced tool selection");
      }
      if (args.thinking?.type === "manual") {
        inferenceConfig.maxTokens = Math.max(args.maxTokens ?? DEFAULT_MAX_TOKENS, args.thinking.budgetTokens + 1);
      }
    } else {
      if (args.temperature !== undefined) inferenceConfig.temperature = args.temperature;
      if (args.topP !== undefined) inferenceConfig.topP = args.topP;
    }
    const request: Record<string, unknown> = { messages, inferenceConfig };
    if (system.length > 0) request.system = system;
    const toolConfig = this.toolConfig(args.tools, args.toolChoice);
    if (toolConfig) request.toolConfig = toolConfig;
    if (additional) request.additionalModelRequestFields = additional;
    this.recordRequestPayload(request);
    return request;
  }

  private recordUsage(model: string, usage: ConverseUsage | undefined): void {
    if (!usage) return;
    const cachedTokens = usage.cacheReadInputTokens ?? 0;
    const cacheWriteTokens = usage.cacheWriteInputTokens ?? 0;
    // Converse reports cache reads and writes apart from inputTokens; the
    // cost calculator expects inputTokens to include them.
    this.trackUsage(model, {
      inputTokens: (usage.inputTokens ?? 0) + cachedTokens + cacheWriteTokens,
      outputTokens: usage.outputTokens ?? 0,
      cachedTokens,
      cacheWriteTokens
    });
  }

  // ── Chat ───────────────────────────────────────────────────────────

  async generateMessage(
    args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    const request = await this.buildRequest(args);
    const response = await this.request(
      "bedrock-runtime",
      "POST",
      this.modelPath(args.model, "converse"),
      request,
      args.signal
    );
    const body = (await response.json()) as {
      output?: { message?: { content?: ConverseBlock[] } };
      usage?: ConverseUsage;
    };
    this.recordUsage(args.model, body.usage);
    const content = body.output?.message?.content ?? [];
    const text = content
      .map((block) => (isString(block.text) ? block.text : ""))
      .join("");
    const thinking = thinkingBlocksOf(content);
    const toolCalls: ToolCall[] = [];
    for (const block of content) {
      const use = block.toolUse;
      if (!isRecord(use)) continue;
      toolCalls.push({
        id: String(use.toolUseId ?? ""),
        name: String(use.name ?? ""),
        args: isRecord(use.input) ? use.input : {},
        _anthropicThinkingBlocks: thinking.length > 0 ? thinking : undefined
      });
    }
    const message: Message = { role: "assistant", content: text };
    if (toolCalls.length > 0) message.toolCalls = toolCalls;
    if (thinking.length > 0) message._anthropicThinkingBlocks = thinking;
    return message;
  }

  async *generateMessages(
    args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    const request = await this.buildRequest(args);
    const response = await this.request(
      "bedrock-runtime",
      "POST",
      this.modelPath(args.model, "converse-stream"),
      request,
      args.signal
    );
    if (!response.body) throw new Error("Bedrock returned an empty stream");

    const tools = new Map<number, { id: string; name: string; input: string }>();
    const thinkingByIndex = new Map<number, AnthropicThinkingBlock>();
    const toolCalls: ToolCall[] = [];

    for await (const event of decodeEventStream(response.body as unknown as AsyncIterable<Uint8Array>)) {
      const payload: unknown = event.payload.length > 0
        ? JSON.parse(new TextDecoder().decode(event.payload))
        : {};
      if (event.headers[":message-type"] === "exception") {
        const type = event.headers[":exception-type"] ?? "exception";
        const message = isRecord(payload) && isString(payload.message) ? payload.message : type;
        throw new Error(`Bedrock error ${STREAM_EXCEPTION_STATUS[type] ?? 500}: ${message}`);
      }
      if (!isRecord(payload)) continue;
      const index = Number(payload.contentBlockIndex ?? 0);

      switch (event.headers[":event-type"]) {
        case "contentBlockStart": {
          const start = payload.start;
          if (isRecord(start) && isRecord(start.toolUse)) {
            tools.set(index, {
              id: String(start.toolUse.toolUseId ?? ""),
              name: String(start.toolUse.name ?? ""),
              input: ""
            });
          }
          break;
        }
        case "contentBlockDelta": {
          const delta = payload.delta;
          if (!isRecord(delta)) break;
          if (isString(delta.text)) {
            if (delta.text) yield { type: "chunk", content: delta.text, done: false };
          } else if (isRecord(delta.toolUse) && isString(delta.toolUse.input)) {
            const tool = tools.get(index);
            if (tool) tool.input += delta.toolUse.input;
          } else if (isRecord(delta.reasoningContent)) {
            const reasoning = delta.reasoningContent;
            let last = thinkingByIndex.get(index);
            if (isString(reasoning.text)) {
              if (last?.type !== "thinking") {
                last = { type: "thinking", thinking: "", signature: "" };
                thinkingByIndex.set(index, last);
              }
              last.thinking += reasoning.text;
              yield { type: "chunk", content: reasoning.text, done: false, thinking: true };
            } else if (isString(reasoning.signature) && last?.type === "thinking") {
              last.signature += reasoning.signature;
            } else if (isString(reasoning.redactedContent)) {
              thinkingByIndex.set(index, { type: "redacted_thinking", data: reasoning.redactedContent });
            }
          }
          break;
        }
        case "contentBlockStop": {
          const tool = tools.get(index);
          if (!tool) break;
          tools.delete(index);
          let input: unknown;
          try {
            input = tool.input ? JSON.parse(tool.input) : {};
          } catch {
            throw new Error("Bedrock returned incomplete tool input JSON");
          }
          toolCalls.push({
            id: tool.id,
            name: tool.name,
            args: isRecord(input) ? input : {}
          });
          break;
        }
        case "metadata":
          this.recordUsage(args.model, payload.usage as ConverseUsage | undefined);
          break;
        default:
          break;
      }
    }

    const thinking = [...thinkingByIndex.values()];
    for (const call of toolCalls) {
      if (thinking.length > 0) call._anthropicThinkingBlocks = [...thinking];
      yield call;
    }
    yield { type: "chunk", content: "", done: true };
  }

  // ── Image generation ───────────────────────────────────────────────

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt) throw new Error("The input prompt cannot be empty.");
    const modelId = params.model.id;
    const family = imageFamily(modelId);
    if (!family) throw new Error(`Bedrock image generation does not support ${modelId}`);

    let body: Record<string, unknown>;
    if (family === "amazon") {
      const config: Record<string, unknown> = { numberOfImages: 1 };
      if (params.width && params.height) {
        config.width = Math.round(params.width / 16) * 16;
        config.height = Math.round(params.height / 16) * 16;
      }
      if (params.guidanceScale != null) config.cfgScale = params.guidanceScale;
      if (params.seed != null && params.seed >= 0) config.seed = params.seed;
      if (params.quality === "premium" || params.quality === "standard") {
        config.quality = params.quality;
      }
      const textParams: Record<string, unknown> = { text: params.prompt };
      if (params.negativePrompt) textParams.negativeText = params.negativePrompt;
      body = { taskType: "TEXT_IMAGE", textToImageParams: textParams, imageGenerationConfig: config };
    } else {
      body = { prompt: params.prompt, output_format: "png" };
      if (params.negativePrompt) body.negative_prompt = params.negativePrompt;
      if (params.aspectRatio) body.aspect_ratio = params.aspectRatio;
      if (params.seed != null && params.seed >= 0) body.seed = params.seed;
    }

    const response = await this.request(
      "bedrock-runtime",
      "POST",
      this.modelPath(modelId, "invoke"),
      body,
      params.signal
    );
    const result = (await response.json()) as {
      images?: string[];
      error?: string;
      finish_reasons?: Array<string | null>;
    };
    if (result.error) throw new Error(`Bedrock image generation failed: ${result.error}`);
    const filtered = result.finish_reasons?.find((reason) => reason);
    if (filtered) throw new Error(`Bedrock image generation was filtered: ${filtered}`);
    const image = result.images?.[0];
    if (!image) throw new Error("Bedrock image generation returned no image data.");
    this.trackUsage(modelId, { imageCount: 1 });
    return new Uint8Array(Buffer.from(image, "base64"));
  }
}
