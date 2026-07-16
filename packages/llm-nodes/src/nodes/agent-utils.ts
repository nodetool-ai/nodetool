import type { BaseNode } from "@nodetool-ai/node-sdk";
import type {
  BaseProvider,
  Message,
  MessageAudioContent,
  MessageContent,
  MessageImageContent,
  ProcessingContext,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";
import { expandAssetReferences } from "@nodetool-ai/runtime";
import type { Chunk } from "@nodetool-ai/protocol";
import { hydrateBuiltinAgentTool } from "./agent-tool-hydration.js";

type MessagePart = { type?: string; text?: string };
type LanguageModelLike = { provider?: string; id?: string; name?: string };

export type ToolLike = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  process?: (
    context: ProcessingContext,
    params: Record<string, unknown>
  ) => Promise<unknown>;
  toProviderTool?: () => {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  };
};

export function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (!value) return "";
  if (Array.isArray(value)) return value.map(asText).join(" ");
  if (typeof value === "object") {
    const msg = value as { content?: string | MessagePart[] };
    if (typeof msg.content === "string") return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content
        .map((part) => (part && part.type === "text" ? (part.text ?? "") : ""))
        .join(" ")
        .trim();
    }
    return JSON.stringify(value);
  }
  return "";
}

export function extractJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function makeThreadId(): string {
  return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter((v) => v.trim().length > 0);
}

export function getModelConfig(props: Record<string, unknown>): {
  providerId: string;
  modelId: string;
} {
  const model = ((props.model ?? {}) as LanguageModelLike) ?? {};
  return {
    providerId: typeof model.provider === "string" ? model.provider : "",
    modelId: typeof model.id === "string" ? model.id : ""
  };
}

export function hasProviderSupport(
  context: ProcessingContext | undefined,
  providerId: string,
  modelId: string
): context is ProcessingContext & {
  getProvider(providerId: string): Promise<BaseProvider>;
} {
  return (
    !!context &&
    typeof context.getProvider === "function" &&
    !!providerId &&
    !!modelId
  );
}

export async function generateProviderMessage(
  provider: BaseProvider,
  args: {
    messages: Message[];
    model: string;
    maxTokens?: number;
  }
): Promise<string> {
  const call =
    typeof provider.generateMessageTraced === "function"
      ? provider.generateMessageTraced.bind(provider)
      : provider.generateMessage.bind(provider);
  const result = await call(args);
  return messageContentText(result.content);
}

/**
 * Call a provider with a result tool to get structured output.
 * The model is forced to call the tool via toolChoice, and the
 * parsed args are returned directly.
 */
export async function generateStructured(
  provider: BaseProvider,
  args: {
    messages: Message[];
    model: string;
    maxTokens?: number;
    toolName: string;
    toolDescription: string;
    schema: Record<string, unknown>;
  }
): Promise<Record<string, unknown> | null> {
  const call =
    typeof provider.generateMessageTraced === "function"
      ? provider.generateMessageTraced.bind(provider)
      : provider.generateMessage.bind(provider);
  const result = await call({
    messages: args.messages,
    model: args.model,
    maxTokens: args.maxTokens,
    tools: [
      {
        name: args.toolName,
        description: args.toolDescription,
        inputSchema: args.schema
      }
    ],
    toolChoice: args.toolName
  });
  const tc = result.toolCalls?.[0];
  if (tc && tc.name === args.toolName) {
    return tc.args as Record<string, unknown>;
  }
  // Fallback: try to parse JSON from text content
  return extractJson(messageContentText(result.content));
}

export function normalizeProviderStreamItem(
  item: ProviderStreamItem
): ProviderStreamItem {
  if (
    !item ||
    typeof item !== "object" ||
    !("type" in item) ||
    (item as Chunk).type !== "chunk"
  ) {
    return item;
  }

  const chunk = item as Chunk;
  if (typeof chunk.content_type === "string" && chunk.content_type.length > 0) {
    return chunk;
  }

  return {
    ...chunk,
    content_type: "text"
  } as Chunk;
}

/**
 * Render a tool-call streaming item as a Chunk so callers see tool dispatches
 * inline with the assistant's text/thinking stream. The structured payload
 * lives in `content_metadata`; `content` is a human-readable summary.
 */
export function toolCallChunk(toolCall: ToolCall): Chunk {
  const argsJson = (() => {
    try {
      return JSON.stringify(toolCall.args ?? {});
    } catch {
      return "{}";
    }
  })();
  return {
    type: "chunk",
    content: `${toolCall.name}(${argsJson})`,
    content_type: "tool_call",
    content_metadata: {
      tool_call_id: toolCall.id,
      tool_name: toolCall.name,
      args: toolCall.args ?? {}
    },
    done: false
  } as Chunk;
}

export async function* streamProviderMessages(
  provider: BaseProvider,
  args: Parameters<BaseProvider["generateMessages"]>[0]
): AsyncGenerator<ProviderStreamItem> {
  const request = {
    ...args,
    messages: [...args.messages],
    tools: args.tools ? [...args.tools] : undefined
  };
  if (typeof provider.generateMessagesTraced === "function") {
    for await (const item of provider.generateMessagesTraced(request)) {
      yield normalizeProviderStreamItem(item);
    }
    return;
  }
  if (typeof provider.generateMessages === "function") {
    for await (const item of provider.generateMessages(request)) {
      yield normalizeProviderStreamItem(item);
    }
    return;
  }
  const result = await provider.generateMessage(request);
  const content = messageContentText(result.content);
  if (content || (result.toolCalls?.length ?? 0) === 0) {
    yield {
      type: "chunk",
      content,
      content_type: "text",
      done: true
    } as Chunk;
  }
  for (const toolCall of result.toolCalls ?? []) {
    yield toolCall;
  }
}

/**
 * Map a model's raw classification output to one of the allowed categories.
 * Tries the parsed JSON `category` field (case-insensitive exact match) first,
 * then a substring-containment scan of the raw text. Throws if neither matches
 * — never invents an answer by defaulting to the first category.
 */
export function parseCategory(raw: string, categories: string[]): string {
  const parsed = extractJson(raw);
  const categoryValue =
    typeof parsed?.category === "string" ? parsed.category : "";
  for (const category of categories) {
    if (categoryValue.trim().toLowerCase() === category.trim().toLowerCase()) {
      return category;
    }
  }

  const lowered = raw.toLowerCase();
  for (const category of categories) {
    if (category.toLowerCase() && lowered.includes(category.toLowerCase())) {
      return category;
    }
  }

  const preview = raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
  throw new Error(
    `Classifier could not map the model output to an allowed category. ` +
      `Model output: ${JSON.stringify(preview)}. ` +
      `Allowed categories: ${categories.join(", ")}.`
  );
}

export function messageContentText(content: Message["content"] | unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return asText(content);
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return asText(part);
      if ((part as { type?: string }).type === "text") {
        return String((part as { text?: unknown }).text ?? "");
      }
      return "";
    })
    .join("")
    .trim();
}

export function normalizeRole(role: unknown): Message["role"] | null {
  if (
    role === "system" ||
    role === "user" ||
    role === "assistant" ||
    role === "tool"
  ) {
    return role;
  }
  return null;
}

export function normalizeBinaryRef(
  value: unknown
): { uri?: string; data?: Uint8Array | string; mimeType?: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const out: { uri?: string; data?: Uint8Array | string; mimeType?: string } =
    {};
  if (typeof record.uri === "string" && record.uri) out.uri = record.uri;
  if (record.data instanceof Uint8Array || typeof record.data === "string")
    out.data = record.data;
  if (typeof record.mimeType === "string" && record.mimeType)
    out.mimeType = record.mimeType;
  if (typeof record.mime_type === "string" && record.mime_type)
    out.mimeType = record.mime_type;
  return out.uri || out.data ? out : null;
}

export function normalizeMessageContent(value: unknown): Message["content"] {
  if (value == null || typeof value === "string") return value ?? null;
  if (!Array.isArray(value)) return asText(value);
  const parts: MessageContent[] = [];
  for (const part of value) {
    if (!part || typeof part !== "object") {
      const text = asText(part);
      if (text) parts.push({ type: "text", text });
      continue;
    }
    const record = part as Record<string, unknown>;
    const kind = typeof record.type === "string" ? record.type : "";
    if (kind === "text") {
      parts.push({ type: "text", text: asText(record.text ?? "") });
      continue;
    }
    if (kind === "image" || kind === "image_url") {
      const image = normalizeBinaryRef(
        record.image ?? record.image_url ?? record.imageUrl
      );
      if (image)
        parts.push({ type: "image_url", image } satisfies MessageImageContent);
      continue;
    }
    if (kind === "audio") {
      const audio = normalizeBinaryRef(record.audio);
      if (audio)
        parts.push({ type: "audio", audio } satisfies MessageAudioContent);
      continue;
    }
    const text = asText(part);
    if (text) parts.push({ type: "text", text });
  }
  return parts;
}

export function normalizeToolCalls(value: unknown): ToolCall[] | null {
  if (!Array.isArray(value)) return null;
  const toolCalls = value
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === "object"
    )
    .map((item, index) => ({
      id:
        typeof item.id === "string" && item.id ? item.id : `tool_${index + 1}`,
      name: typeof item.name === "string" ? item.name : "",
      args:
        item.args && typeof item.args === "object"
          ? (item.args as Record<string, unknown>)
          : {}
    }))
    .filter((item) => item.name.length > 0);
  return toolCalls.length > 0 ? toolCalls : null;
}

export function normalizeMessage(value: unknown): Message | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const role = normalizeRole(record.role);
  if (!role) return null;
  return {
    role,
    content: normalizeMessageContent(record.content),
    toolCalls: normalizeToolCalls(record.toolCalls ?? record.tool_calls),
    toolCallId:
      typeof record.toolCallId === "string"
        ? record.toolCallId
        : typeof record.tool_call_id === "string"
          ? record.tool_call_id
          : null,
    threadId:
      typeof record.threadId === "string"
        ? record.threadId
        : typeof record.thread_id === "string"
          ? record.thread_id
          : null
  };
}

/**
 * Normalize a list-typed media input to an array. Accepts an array (the
 * declared `list[image]`/`list[audio]` shape), a lone ref (defensive, in case
 * coercion didn't run), or null/undefined.
 */
export function toRefArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

export function buildUserMessage(
  prompt: string,
  images: unknown,
  audios: unknown
): Message {
  const content: MessageContent[] = expandAssetReferences(prompt);
  for (const image of toRefArray(images)) {
    const imageRef = normalizeBinaryRef(image);
    if (imageRef) {
      content.push({ type: "image_url", image: imageRef });
    }
  }
  for (const audio of toRefArray(audios)) {
    const audioRef = normalizeBinaryRef(audio);
    if (audioRef) {
      content.push({ type: "audio", audio: audioRef });
    }
  }
  return { role: "user", content };
}

export function isChunkItem(item: ProviderStreamItem): item is Chunk {
  return (
    !!item &&
    typeof item === "object" &&
    "type" in item &&
    (item as Chunk).type === "chunk"
  );
}

export function isToolCallItem(item: ProviderStreamItem): item is ToolCall {
  return (
    !!item &&
    typeof item === "object" &&
    "id" in item &&
    "name" in item &&
    !("type" in item)
  );
}

export function normalizeTools(value: unknown): ToolLike[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (tool): tool is ToolLike =>
        !!tool &&
        typeof tool === "object" &&
        typeof (tool as { name?: unknown }).name === "string"
    )
    .map((tool) => hydrateBuiltinAgentTool(tool) as ToolLike);
}

export function uniqueToolName(baseName: string, existingNames: string[]): string {
  const used = new Set(existingNames);
  if (!used.has(baseName)) return baseName;
  let suffix = 2;
  while (used.has(`${baseName}_${suffix}`)) suffix += 1;
  return `${baseName}_${suffix}`;
}

export function toProviderTools(tools: ToolLike[]): Array<{
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}> {
  return tools.map((tool) =>
    typeof tool.toProviderTool === "function"
      ? tool.toProviderTool()
      : {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }
  );
}

export function serializeToolResult(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(serializeToolResult);
  if (typeof value !== "object") return value;
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("base64");
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      key,
      serializeToolResult(item)
    ])
  );
}

export function getStructuredOutputSchema(
  node: BaseNode
): Record<string, unknown> | null {
  const outputs = (node as { _dynamic_outputs?: unknown })._dynamic_outputs;
  if (!outputs || typeof outputs !== "object" || Array.isArray(outputs))
    return null;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [name, spec] of Object.entries(
    outputs as Record<string, unknown>
  )) {
    required.push(name);
    const value =
      spec && typeof spec === "object" ? (spec as Record<string, unknown>) : {};
    const declared =
      typeof value.type === "string" ? value.type.toLowerCase() : "str";
    let type = "string";
    if (["int", "integer"].includes(declared)) type = "integer";
    else if (["float", "number"].includes(declared)) type = "number";
    else if (["bool", "boolean"].includes(declared)) type = "boolean";
    else if (["list", "array"].includes(declared)) type = "array";
    else if (["dict", "object"].includes(declared)) type = "object";
    properties[name] = { type };
  }
  if (required.length === 0) return null;
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties
  };
}

export function hasContentType(
  message: Message | undefined,
  type: MessageContent["type"]
): boolean {
  return Array.isArray(message?.content)
    ? message!.content.some((part: MessageContent) => part.type === type)
    : false;
}
