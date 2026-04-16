import { createLogger } from "@nodetool/config";
import { BaseNode, prop } from "@nodetool/node-sdk";
import type {
  BaseProvider,
  Message,
  MessageAudioContent,
  MessageContent,
  MessageImageContent,
  ProcessingContext,
  ProviderStreamItem,
  ToolCall
} from "@nodetool/runtime";
import type { Chunk, ProcessingMessage } from "@nodetool/protocol";
import { MultiModeAgent, Tool as AgentTool } from "@nodetool/agents";

type MessagePart = { type?: string; text?: string };
type ThreadLike = { id: string; title: string; messages: Message[] };
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

const THREAD_STORE = new Map<string, ThreadLike>();
const log = createLogger("nodetool.base-nodes.agents");
const DEFAULT_SYSTEM_PROMPT = "You are a friendly assistant";
const EXTRACTOR_SYSTEM_PROMPT = [
  "You are a precise structured data extractor.",
  "Return exactly one JSON object and no additional prose.",
  "Use only information present in the input."
].join(" ");
const CLASSIFIER_SYSTEM_PROMPT = [
  "You are a precise classifier.",
  "Choose exactly one category from the allowed list.",
  'Return only JSON matching {"category":"<allowed-category>"} with no extra text.'
].join(" ");
const SUMMARIZER_SYSTEM_PROMPT =
  "You are an expert summarizer. Produce a concise, accurate summary.";
function asText(value: unknown): string {
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

function summarize(text: string, maxSentences: number): string {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return "";
  return parts.slice(0, Math.max(1, maxSentences)).join(" ");
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function extractJson(text: string): Record<string, unknown> | null {
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

function makeThreadId(): string {
  return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter((v) => v.trim().length > 0);
}

function getModelConfig(props: Record<string, unknown>): {
  providerId: string;
  modelId: string;
} {
  const model = ((props.model ?? {}) as LanguageModelLike) ?? {};
  return {
    providerId: typeof model.provider === "string" ? model.provider : "",
    modelId: typeof model.id === "string" ? model.id : ""
  };
}

function hasProviderSupport(
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

async function generateProviderMessage(
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
async function generateStructured(
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

function normalizeProviderStreamItem(
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
 * Check whether a provider supports native agentic tool execution (MCP).
 * When true, the provider handles tool calls internally via onToolCall callback.
 */
function isAgenticProvider(provider: BaseProvider): boolean {
  return (
    (provider as unknown as Record<string, unknown>).provider === "claude_agent"
  );
}

function parseCategory(raw: string, categories: string[]): string {
  if (categories.length === 0) return "Unknown";

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

  for (const fallback of ["other", "unknown"]) {
    for (const category of categories) {
      if (category.trim().toLowerCase() === fallback) return category;
    }
  }

  return categories[0];
}

function messageContentText(content: Message["content"] | unknown): string {
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

function normalizeRole(role: unknown): Message["role"] | null {
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

function normalizeBinaryRef(
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

function normalizeMessageContent(value: unknown): Message["content"] {
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
        parts.push({ type: "image", image } satisfies MessageImageContent);
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

function normalizeToolCalls(value: unknown): ToolCall[] | null {
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

function normalizeMessage(value: unknown): Message | null {
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

function threadMessages(threadId: string): Message[] {
  const thread = THREAD_STORE.get(threadId);
  if (!thread) return [];
  return thread.messages.map((message) => ({ ...message }));
}

function logThreadWarning(
  message: string,
  error: unknown,
  details: Record<string, unknown>
): void {
  if (process.env["NODE_ENV"] === "test") return;
  console.warn(`[AgentNode] ${message}`, {
    ...details,
    error: String(error)
  });
}

function buildUserMessage(
  prompt: string,
  image: unknown,
  audio: unknown
): Message {
  const content: MessageContent[] = [{ type: "text", text: prompt }];
  const imageRef = normalizeBinaryRef(image);
  if (imageRef) {
    content.push({ type: "image", image: imageRef });
  }
  const audioRef = normalizeBinaryRef(audio);
  if (audioRef) {
    content.push({ type: "audio", audio: audioRef });
  }
  return { role: "user", content };
}

async function loadThreadMessages(
  context: ProcessingContext | undefined,
  threadId: string
): Promise<Message[]> {
  if (!threadId) return [];
  const threadedContext = context as
    | (ProcessingContext & {
        get_messages?: (
          threadId: string,
          limit?: number,
          startKey?: string | null,
          reverse?: boolean
        ) => Promise<{ messages: Array<Record<string, unknown>> }>;
        getThreadMessages?: (
          threadId: string,
          limit?: number,
          startKey?: string | null,
          reverse?: boolean
        ) => Promise<{ messages: Array<Record<string, unknown>> }>;
      })
    | undefined;
  const getMessages =
    threadedContext?.get_messages?.bind(threadedContext) ??
    threadedContext?.getThreadMessages?.bind(threadedContext);
  if (getMessages) {
    try {
      const result = await getMessages(threadId, 1000, null, false);
      const messages = (result.messages ?? [])
        .map((item: Record<string, unknown>) => normalizeMessage(item))
        .filter(
          (message: Message | null): message is Message =>
            message !== null && message.role !== "system"
        );
      log.info("Agent thread history loaded from context", {
        threadId,
        messageCount: messages.length
      });
      return messages;
    } catch (error) {
      logThreadWarning("Failed to load thread messages", error, { threadId });
    }
  }
  const fallbackMessages = threadMessages(threadId).filter(
    (message) => message.role !== "system"
  );
  log.info("Agent thread history loaded from fallback store", {
    threadId,
    messageCount: fallbackMessages.length
  });
  return fallbackMessages;
}

async function saveThreadMessage(
  context: ProcessingContext | undefined,
  threadId: string,
  message: Message
): Promise<void> {
  if (!threadId) return;
  const threadedContext = context as
    | (ProcessingContext & {
        create_message?: (req: Record<string, unknown>) => Promise<unknown>;
        createMessage?: (req: Record<string, unknown>) => Promise<unknown>;
      })
    | undefined;
  const createMessage =
    threadedContext?.create_message?.bind(threadedContext) ??
    threadedContext?.createMessage?.bind(threadedContext);
  if (createMessage) {
    try {
      await createMessage({
        thread_id: threadId,
        role: message.role,
        content: message.content ?? null,
        tool_calls: message.toolCalls ?? null,
        tool_call_id: message.toolCallId ?? null
      });
      log.info("Agent thread message saved via context", {
        threadId,
        role: message.role,
        hasToolCalls: (message.toolCalls?.length ?? 0) > 0,
        textLength: messageContentText(message.content).length
      });
      return;
    } catch (error) {
      logThreadWarning("Failed to save thread message", error, {
        threadId,
        role: message.role
      });
    }
  }

  const thread = THREAD_STORE.get(threadId) ?? {
    id: threadId,
    title: "Agent Conversation",
    messages: []
  };
  thread.messages.push({
    ...message,
    threadId
  });
  THREAD_STORE.set(threadId, thread);
  log.info("Agent thread message saved via fallback store", {
    threadId,
    role: message.role,
    threadSize: thread.messages.length,
    hasToolCalls: (message.toolCalls?.length ?? 0) > 0,
    textLength: messageContentText(message.content).length
  });
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

function normalizeTools(value: unknown): ToolLike[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (tool): tool is ToolLike =>
      !!tool &&
      typeof tool === "object" &&
      typeof (tool as { name?: unknown }).name === "string"
  );
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

// ---------------------------------------------------------------------------
// Control tool support for Agent nodes with outgoing control edges
// ---------------------------------------------------------------------------

/**
 * Marker symbol to identify control tools built from _control_context.
 */
const CONTROL_TOOL_MARKER = Symbol("controlTool");

interface ControlToolLike extends ToolLike {
  [CONTROL_TOOL_MARKER]: true;
  targetNodeId: string;
}

function isControlTool(tool: ToolLike): tool is ControlToolLike {
  return (
    CONTROL_TOOL_MARKER in tool &&
    (tool as ControlToolLike)[CONTROL_TOOL_MARKER] === true
  );
}

/**
 * Sanitize a node title to a valid tool name (snake_case, max 64 chars).
 */
function sanitizeControlToolName(name: string): string {
  if (!name) return "control_node";
  let s = name
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!s) return "control_node";
  if (s.length > 64) s = s.slice(0, 64);
  return s;
}

/**
 * Build ControlToolLike instances from `_control_context` input.
 * These tools allow the agent's LLM to call controlled nodes via tool-calling.
 */
function buildControlTools(controlContext: unknown): ControlToolLike[] {
  if (!controlContext || typeof controlContext !== "object") return [];

  const tools: ControlToolLike[] = [];

  for (const [targetId, info] of Object.entries(
    controlContext as Record<string, unknown>
  )) {
    if (!info || typeof info !== "object") continue;
    const nodeInfo = info as Record<string, unknown>;

    const nodeTitle = String(
      nodeInfo.node_title ?? nodeInfo.node_type ?? targetId
    );
    const toolName = sanitizeControlToolName(nodeTitle);

    // Build input schema from control_actions.run.properties
    const actions = (nodeInfo.control_actions ?? {}) as Record<string, unknown>;
    const runAction = (actions.run ?? {}) as Record<string, unknown>;
    const rawProperties = (runAction.properties ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    const properties: Record<string, Record<string, unknown>> = {};
    for (const [key, schema] of Object.entries(rawProperties)) {
      if (typeof schema === "object" && schema !== null) {
        properties[key] = { ...schema };
      } else {
        properties[key] = { type: "string", description: String(schema) };
      }
    }

    const inputSchema = {
      type: "object",
      properties,
      required: [] as string[]
    };

    let description = `Control ${nodeTitle}: trigger execution with optional property overrides`;
    const propNames = Object.keys(properties);
    if (propNames.length > 0) {
      description += `. Available properties: ${propNames.join(", ")}`;
    }

    tools.push({
      [CONTROL_TOOL_MARKER]: true as const,
      targetNodeId: targetId,
      name: toolName,
      description,
      inputSchema,
      // Stub process — actual execution goes through sendControlEvent
      async process(_ctx: ProcessingContext, _params: Record<string, unknown>) {
        return { status: "dispatched", target: targetId };
      },
      toProviderTool() {
        return { name: toolName, description, inputSchema };
      }
    });
  }

  return tools;
}

/**
 * Adapter that wraps a ToolLike (from base-nodes) as an AgentTool (from @nodetool/agents).
 * This bridges the tool systems so MultiModeAgent can use tools defined in the node graph.
 */
class ToolLikeAdapter extends AgentTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  private readonly _process: (
    context: ProcessingContext,
    params: Record<string, unknown>
  ) => Promise<unknown>;

  constructor(toolLike: ToolLike) {
    super();
    this.name = toolLike.name;
    this.description = toolLike.description ?? "";
    this.inputSchema = toolLike.inputSchema ?? {
      type: "object",
      properties: {}
    };
    this._process =
      toolLike.process ??
      (async () => ({ error: "Tool has no process implementation" }));
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return this._process(context, params);
  }
}

export interface AgentLoopOptions {
  context: ProcessingContext;
  providerId: string;
  modelId: string;
  systemPrompt: string;
  prompt: string;
  tools: ToolLike[];
  contentParts?: MessageContent[];
  maxTokens?: number;
  maxIterations?: number;
  threadId?: string;
}

export interface AgentLoopResult {
  text: string;
  messages: Message[];
}

export async function runAgentLoop(
  options: AgentLoopOptions
): Promise<AgentLoopResult> {
  const {
    context,
    providerId,
    modelId,
    systemPrompt,
    prompt,
    tools,
    contentParts,
    maxTokens = 4096,
    maxIterations = 10
  } = options;

  if (!context || typeof context.getProvider !== "function") {
    throw new Error("Processing context with provider access is required");
  }

  const userContent: MessageContent[] = [{ type: "text", text: prompt }];
  if (contentParts) {
    userContent.push(...contentParts);
  }

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ];

  const providerTools = tools.length > 0 ? toProviderTools(tools) : undefined;
  const provider = await context.getProvider(providerId);
  let lastAssistantText = "";

  // --- Agentic provider fast-path ---
  if (isAgenticProvider(provider) && tools.length > 0) {
    const onToolCall = async (
      name: string,
      args: Record<string, unknown>
    ): Promise<string> => {
      const tool = tools.find((t) => t.name === name);
      if (!tool || typeof tool.process !== "function") {
        return JSON.stringify({ error: `Unknown tool: ${name}` });
      }
      try {
        const result = await tool.process(context, args);
        return typeof result === "string"
          ? result
          : JSON.stringify(serializeToolResult(result));
      } catch (e) {
        return JSON.stringify({ error: String(e) });
      }
    };

    let assistantText = "";
    for await (const item of streamProviderMessages(provider, {
      messages,
      model: modelId,
      tools: providerTools,
      maxTokens,
      threadId: options.threadId,
      onToolCall
    })) {
      if (isChunkItem(item) && !item.thinking) {
        assistantText += item.content ?? "";
      }
    }

    if (assistantText) {
      lastAssistantText = assistantText;
      messages.push({
        role: "assistant",
        content: [{ type: "text", text: assistantText }]
      });
    }

    return { text: lastAssistantText, messages };
  }

  // --- Standard multi-iteration loop ---
  let iteration = 0;
  let shouldContinue = true;

  while (shouldContinue && iteration < maxIterations) {
    shouldContinue = false;
    iteration++;

    const assistantToolCalls: ToolCall[] = [];
    let assistantText = "";

    for await (const item of streamProviderMessages(provider, {
      messages,
      model: modelId,
      tools: providerTools,
      maxTokens,
      threadId: options.threadId
    })) {
      if (isChunkItem(item)) {
        if (!item.thinking) {
          assistantText += item.content ?? "";
        }
      }
      if (isToolCallItem(item)) {
        assistantToolCalls.push(item);
      }
    }

    if (assistantText) {
      lastAssistantText = assistantText;
    }

    if (assistantText || assistantToolCalls.length > 0) {
      const assistantMsg: Message = {
        role: "assistant",
        content: [{ type: "text", text: assistantText }],
        toolCalls: assistantToolCalls.length > 0 ? assistantToolCalls : null
      };
      // Propagate raw Gemini parts for thought signature replay
      const rawParts = assistantToolCalls.find(
        (tc) => tc._rawGeminiParts
      )?._rawGeminiParts;
      if (rawParts) {
        assistantMsg._rawGeminiParts = rawParts as unknown[];
      }
      messages.push(assistantMsg);
    }

    for (const toolCall of assistantToolCalls) {
      const tool = tools.find((t) => t.name === toolCall.name);
      if (!tool || typeof tool.process !== "function") {
        messages.push({
          role: "tool",
          toolCallId: toolCall.id,
          content: JSON.stringify({ error: `Unknown tool: ${toolCall.name}` })
        });
        shouldContinue = true;
        continue;
      }
      const result = await tool.process(context, toolCall.args);
      messages.push({
        role: "tool",
        toolCallId: toolCall.id,
        content: JSON.stringify(serializeToolResult(result))
      });
      shouldContinue = true;
    }
  }

  if (iteration >= maxIterations) {
    log.warn("runAgentLoop reached max iterations", {
      maxIterations,
      providerId,
      modelId
    });
  }

  return { text: lastAssistantText, messages };
}

function getStructuredOutputSchema(
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
  return {
    type: "object",
    additionalProperties: false,
    required,
    properties
  };
}

function hasContentType(
  message: Message | undefined,
  type: MessageContent["type"]
): boolean {
  return Array.isArray(message?.content)
    ? message!.content.some((part: MessageContent) => part.type === type)
    : false;
}

export class SummarizerNode extends BaseNode {
  static readonly nodeType = "nodetool.agents.Summarizer";
  static readonly title = "Summarizer";
  static readonly description =
    "Generate concise summaries of text content using LLM providers with streaming output.\n    text, summarization, nlp, content, streaming\n\n    Specialized for creating high-quality summaries with real-time streaming:\n    - Condensing long documents into key points\n    - Creating executive summaries with live output\n    - Extracting main ideas from text as they're generated\n    - Maintaining factual accuracy while reducing length";
  static readonly metadataOutputTypes = {
    text: "str",
    chunk: "chunk"
  };
  static readonly basicFields = ["text", "model", "image", "audio"];
  static readonly recommendedModels = [
    {
      id: "phi3.5:latest",
      type: "llama_model",
      name: "Phi3.5",
      repo_id: "phi3.5:latest",
      description:
        "Lightweight 3.8B model tuned for crisp instruction following and compact summaries on modest hardware.",
      size_on_disk: 2362232012
    },
    {
      id: "mistral-small:latest",
      type: "llama_model",
      name: "Mistral Small",
      repo_id: "mistral-small:latest",
      description:
        "Efficient mixture-of-experts model that delivers reliable abstractive summaries with low latency.",
      size_on_disk: 7730941132
    },
    {
      id: "llama3.2:3b",
      type: "llama_model",
      name: "Llama 3.2 - 3B",
      repo_id: "llama3.2:3b",
      description:
        "Compact Llama variant that balances coverage and brevity for everyday summarization workloads.",
      size_on_disk: 2040109465
    },
    {
      id: "gemma3:4b",
      type: "llama_model",
      name: "Gemma3 - 4B",
      repo_id: "gemma3:4b",
      description:
        "Google's 4B multimodal model performs strong factual summaries while staying resource friendly.",
      size_on_disk: 2791728742
    },
    {
      id: "granite3.1-moe:3b",
      type: "llama_model",
      name: "Granite 3.1 MOE - 3B",
      repo_id: "granite3.1-moe:3b",
      description:
        "IBM Granite MoE delivers focused meeting notes and bullet summaries with minimal VRAM needs.",
      size_on_disk: 1717986918
    },
    {
      id: "qwen3:4b",
      type: "llama_model",
      name: "Qwen3 - 4B",
      repo_id: "qwen3:4b",
      description:
        "Qwen3 4B offers multilingual summarization with tight, well-structured outputs.",
      size_on_disk: 2684354560
    },
    {
      id: "ggml-org/gemma-3-4b-it-GGUF:gemma-3-4b-it-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Gemma 3 4B IT (GGUF)",
      repo_id: "ggml-org/gemma-3-4b-it-GGUF",
      path: "gemma-3-4b-it-Q4_K_M.gguf",
      description: "Efficient Gemma 3 for summarization via llama.cpp.",
      size_on_disk: 3113851289,
      pipeline_tag: "image-text-to-text",
      tags: [
        "gguf",
        "image-text-to-text",
        "arxiv:1905.07830",
        "arxiv:1905.10044",
        "arxiv:1911.11641",
        "arxiv:1904.09728",
        "arxiv:1705.03551",
        "arxiv:1911.01547",
        "arxiv:1907.10641",
        "arxiv:1903.00161",
        "arxiv:2009.03300",
        "arxiv:2304.06364",
        "arxiv:2103.03874",
        "arxiv:2110.14168",
        "arxiv:2311.12022",
        "arxiv:2108.07732",
        "arxiv:2107.03374",
        "arxiv:2210.03057",
        "arxiv:2106.03193",
        "arxiv:1910.11856",
        "arxiv:2502.12404",
        "arxiv:2502.21228",
        "arxiv:2404.16816",
        "arxiv:2104.12756",
        "arxiv:2311.16502",
        "arxiv:2203.10244",
        "arxiv:2404.12390",
        "arxiv:1810.12440",
        "arxiv:1908.02660",
        "arxiv:2312.11805",
        "base_model:google/gemma-3-4b-it",
        "base_model:quantized:google/gemma-3-4b-it",
        "license:gemma",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 25779,
      likes: 48
    }
  ];

  static readonly isStreamingOutput = true;
  @prop({
    type: "str",
    default:
      "\n        You are an expert summarizer. Your task is to create clear, accurate, and concise summaries using Markdown for structuring.\n        Follow these guidelines:\n        1. Identify and include only the most important information.\n        2. Maintain factual accuracy - do not add or modify information.\n        3. Use clear, direct language.\n        4. Aim for approximately {self.max_tokens} tokens.\n        ",
    title: "System Prompt",
    description: "The system prompt for the summarizer"
  })
  declare system_prompt: any;

  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model to use for summarization"
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to summarize"
  })
  declare text: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "Optional image to condition the summary"
  })
  declare image: any;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "Optional audio to condition the summary"
  })
  declare audio: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const text = asText(this.text ?? this.text ?? "");
    const maxSentences = Number((this as any).max_sentences ?? 3);
    const { providerId, modelId } = getModelConfig(this.serialize());
    if (hasProviderSupport(context, providerId, modelId)) {
      const provider = await context.getProvider(providerId);
      const result = await generateProviderMessage(provider, {
        model: modelId,
        maxTokens: Number.isFinite(maxSentences)
          ? Math.max(64, maxSentences * 128)
          : 384,
        messages: [
          { role: "system", content: SUMMARIZER_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Summarize the following text in about ${Math.max(1, maxSentences)} sentence(s):\n\n${text}`
          }
        ]
      });
      return { text: result, output: result };
    }
    const result = summarize(
      text,
      Number.isFinite(maxSentences) ? maxSentences : 3
    );
    return { text: result, output: result };
  }
}

export class CreateThreadNode extends BaseNode {
  static readonly nodeType = "nodetool.agents.CreateThread";
  static readonly title = "Create Thread";
  static readonly description =
    "Create a new conversation thread and return its ID.\n    threads, chat, conversation, context\n\n    Use this to seed a thread_id that downstream Agent nodes can reuse for\n    persistent history across the graph or multiple runs.";
  static readonly metadataOutputTypes = {
    thread_id: "str"
  };

  @prop({
    type: "str",
    default: "Agent Conversation",
    title: "Title",
    description: "Optional title for the new thread"
  })
  declare title: any;

  @prop({
    type: "str",
    default: "",
    title: "Thread Id",
    description:
      "Optional custom thread ID. If provided and owned by the user, it will be reused; otherwise a new thread is created."
  })
  declare thread_id: any;

  async process(): Promise<Record<string, unknown>> {
    const requested = String(this.thread_id ?? this.thread_id ?? "").trim();
    if (requested) {
      if (!THREAD_STORE.has(requested)) {
        THREAD_STORE.set(requested, {
          id: requested,
          title: String(this.title ?? this.title ?? "Agent Conversation"),
          messages: []
        });
      }
      return { thread_id: requested };
    }

    const id = makeThreadId();
    THREAD_STORE.set(id, {
      id,
      title: String(this.title ?? this.title ?? "Agent Conversation"),
      messages: []
    });
    return { thread_id: id };
  }
}

export class ExtractorNode extends BaseNode {
  static readonly nodeType = "nodetool.agents.Extractor";
  static readonly title = "Extractor";
  static readonly description =
    "Extract structured data from text content using LLM providers.\n    data-extraction, structured-data, nlp, parsing\n\n    Specialized for extracting structured information:\n    - Converting unstructured text into structured data\n    - Identifying and extracting specific fields from documents\n    - Parsing text according to predefined schemas\n    - Creating structured records from natural language content";
  static readonly basicFields = ["text", "model", "image", "audio"];
  static readonly supportsDynamicOutputs = true;
  static readonly recommendedModels = [
    {
      id: "phi3.5:latest",
      type: "llama_model",
      name: "Phi3.5",
      repo_id: "phi3.5:latest",
      description:
        "Small Phi variant excels at JSON-style outputs and faithful field extraction on laptops.",
      size_on_disk: 2362232012
    },
    {
      id: "mistral-small:latest",
      type: "llama_model",
      name: "Mistral Small",
      repo_id: "mistral-small:latest",
      description:
        "MoE architecture keeps structured extraction consistent while staying resource efficient.",
      size_on_disk: 7730941132
    },
    {
      id: "granite3.1-moe:3b",
      type: "llama_model",
      name: "Granite 3.1 MOE - 3B",
      repo_id: "granite3.1-moe:3b",
      description:
        "Granite MoE models are tuned for business document parsing and schema-following tasks.",
      size_on_disk: 1717986918
    },
    {
      id: "gemma3:4b",
      type: "llama_model",
      name: "Gemma3 - 4B",
      repo_id: "gemma3:4b",
      description:
        "Gemma 3 4B handles multilingual extraction and adheres to required JSON schemas.",
      size_on_disk: 2791728742
    },
    {
      id: "qwen2.5-coder:3b",
      type: "llama_model",
      name: "Qwen2.5-Coder - 3B",
      repo_id: "qwen2.5-coder:3b",
      description:
        "Code-focused Qwen variant generates precise structured outputs and respects schema rules.",
      size_on_disk: 1932735283
    },
    {
      id: "deepseek-r1:7b",
      type: "llama_model",
      name: "Deepseek R1 - 7B",
      repo_id: "deepseek-r1:7b",
      description:
        "Reasoning-oriented DeepSeek shines when extraction needs cross-field validation.",
      size_on_disk: 4617089843
    },
    {
      id: "ggml-org/gemma-3-4b-it-GGUF:gemma-3-4b-it-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Gemma 3 4B IT (GGUF)",
      repo_id: "ggml-org/gemma-3-4b-it-GGUF",
      path: "gemma-3-4b-it-Q4_K_M.gguf",
      description: "Efficient Gemma 3 for extraction via llama.cpp.",
      size_on_disk: 3113851289,
      pipeline_tag: "image-text-to-text",
      tags: [
        "gguf",
        "image-text-to-text",
        "arxiv:1905.07830",
        "arxiv:1905.10044",
        "arxiv:1911.11641",
        "arxiv:1904.09728",
        "arxiv:1705.03551",
        "arxiv:1911.01547",
        "arxiv:1907.10641",
        "arxiv:1903.00161",
        "arxiv:2009.03300",
        "arxiv:2304.06364",
        "arxiv:2103.03874",
        "arxiv:2110.14168",
        "arxiv:2311.12022",
        "arxiv:2108.07732",
        "arxiv:2107.03374",
        "arxiv:2210.03057",
        "arxiv:2106.03193",
        "arxiv:1910.11856",
        "arxiv:2502.12404",
        "arxiv:2502.21228",
        "arxiv:2404.16816",
        "arxiv:2104.12756",
        "arxiv:2311.16502",
        "arxiv:2203.10244",
        "arxiv:2404.12390",
        "arxiv:1810.12440",
        "arxiv:1908.02660",
        "arxiv:2312.11805",
        "base_model:google/gemma-3-4b-it",
        "base_model:quantized:google/gemma-3-4b-it",
        "license:gemma",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 25779,
      likes: 48
    }
  ];

  @prop({
    type: "str",
    default:
      '\nYou are a precise structured data extractor.\n\nGoal\n- Extract exactly the fields described in <JSON_SCHEMA> from the content in <TEXT> (and any attached media).\n\nOutput format (MANDATORY)\n- Output exactly ONE fenced code block labeled json containing ONLY the JSON object:\n\n  ```json\n  { ...single JSON object matching <JSON_SCHEMA>... }\n  ```\n\n- No additional prose before or after the block.\n\nExtraction rules\n- Use only information found in <TEXT> or attached media. Do not invent facts.\n- Preserve source values; normalize internal whitespace and trim leading/trailing spaces.\n- If a required field is missing or not explicitly stated, return the closest reasonable default consistent with its type:\n  - string: ""\n  - number: 0\n  - boolean: false\n  - array/object: empty value of that type (only if allowed by the schema)\n- Dates/times: prefer ISO 8601 when the schema type is string and the value represents a date/time.\n- If multiple candidates exist, choose the most precise and unambiguous one.\n\nValidation\n- Ensure the final JSON validates against <JSON_SCHEMA> exactly.\n',
    title: "System Prompt",
    description: "The system prompt for the data extractor"
  })
  declare system_prompt: any;

  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model to use for data extraction"
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to extract data from"
  })
  declare text: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "Optional image to assist extraction"
  })
  declare image: any;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "Optional audio to assist extraction"
  })
  declare audio: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const text = asText(this.text ?? this.text ?? "");
    const { providerId, modelId } = getModelConfig(this.serialize());
    if (hasProviderSupport(context, providerId, modelId)) {
      const provider = await context.getProvider(providerId);
      const schema = getStructuredOutputSchema(this) ?? {
        type: "object",
        properties: { output: { type: "string" } },
        required: ["output"],
        additionalProperties: true
      };
      const result = await generateStructured(provider, {
        model: modelId,
        maxTokens: Number((this as any).max_tokens ?? 1024),
        messages: [
          { role: "system", content: EXTRACTOR_SYSTEM_PROMPT },
          { role: "user", content: text }
        ],
        toolName: "extraction_result",
        toolDescription: "Submit the extracted data.",
        schema
      });
      if (result) return result;
    }
    const parsed = extractJson(text);
    if (parsed) return parsed;
    return { output: text };
  }
}

export class ClassifierNode extends BaseNode {
  static readonly nodeType = "nodetool.agents.Classifier";
  static readonly title = "Classifier";
  static readonly description =
    "Classify text into predefined or dynamic categories using LLM.\n    classification, nlp, categorization\n\n    Use cases:\n    - Sentiment analysis\n    - Topic classification\n    - Intent detection\n    - Content categorization";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly basicFields = [
    "text",
    "categories",
    "model",
    "image",
    "audio"
  ];
  static readonly recommendedModels = [
    {
      id: "phi3.5:latest",
      type: "llama_model",
      name: "Phi3.5",
      repo_id: "phi3.5:latest",
      description:
        "Reliable small model for intent and sentiment classification when VRAM is tight.",
      size_on_disk: 2362232012
    },
    {
      id: "mistral-small:latest",
      type: "llama_model",
      name: "Mistral Small",
      repo_id: "mistral-small:latest",
      description:
        "Fast MoE model that keeps category predictions consistent across batches.",
      size_on_disk: 7730941132
    },
    {
      id: "granite3.1-moe:1b",
      type: "llama_model",
      name: "Granite 3.1 MOE - 1B",
      repo_id: "granite3.1-moe:1b",
      description:
        "IBM Granite 1B excels at classification and routing tasks on CPUs and edge devices.",
      size_on_disk: 751619276
    },
    {
      id: "qwen3:1.7b",
      type: "llama_model",
      name: "Qwen3 - 1.7B",
      repo_id: "qwen3:1.7b",
      description:
        "Compact Qwen variant provides multilingual label understanding with low latency.",
      size_on_disk: 1073741824
    },
    {
      id: "gemma3:1b",
      type: "llama_model",
      name: "Gemma3 - 1B",
      repo_id: "gemma3:1b",
      description:
        "Gemma 3 1B offers deterministic small-footprint classification for mobile scenarios.",
      size_on_disk: 805306368
    },
    {
      id: "deepseek-r1:1.5b",
      type: "llama_model",
      name: "Deepseek R1 - 1.5B",
      repo_id: "deepseek-r1:1.5b",
      description:
        "Reasoning-focused DeepSeek variant is great for multi-step label decisions.",
      size_on_disk: 912680550
    },
    {
      id: "ggml-org/gemma-3-4b-it-GGUF:gemma-3-4b-it-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Gemma 3 4B IT (GGUF)",
      repo_id: "ggml-org/gemma-3-4b-it-GGUF",
      path: "gemma-3-4b-it-Q4_K_M.gguf",
      description: "Efficient Gemma 3 for classification via llama.cpp.",
      size_on_disk: 3113851289,
      pipeline_tag: "image-text-to-text",
      tags: [
        "gguf",
        "image-text-to-text",
        "arxiv:1905.07830",
        "arxiv:1905.10044",
        "arxiv:1911.11641",
        "arxiv:1904.09728",
        "arxiv:1705.03551",
        "arxiv:1911.01547",
        "arxiv:1907.10641",
        "arxiv:1903.00161",
        "arxiv:2009.03300",
        "arxiv:2304.06364",
        "arxiv:2103.03874",
        "arxiv:2110.14168",
        "arxiv:2311.12022",
        "arxiv:2108.07732",
        "arxiv:2107.03374",
        "arxiv:2210.03057",
        "arxiv:2106.03193",
        "arxiv:1910.11856",
        "arxiv:2502.12404",
        "arxiv:2502.21228",
        "arxiv:2404.16816",
        "arxiv:2104.12756",
        "arxiv:2311.16502",
        "arxiv:2203.10244",
        "arxiv:2404.12390",
        "arxiv:1810.12440",
        "arxiv:1908.02660",
        "arxiv:2312.11805",
        "base_model:google/gemma-3-4b-it",
        "base_model:quantized:google/gemma-3-4b-it",
        "license:gemma",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 25779,
      likes: 48
    }
  ];

  @prop({
    type: "str",
    default:
      '\nYou are a precise classifier.\n\nGoal\n- Select exactly one category from the list provided by the user.\n\nOutput format (MANDATORY)\n- Return ONLY a single JSON object with this exact schema and nothing else:\n  {"category": "<one-of-the-allowed-categories>"}\n- No prose, no Markdown, no code fences, no explanations, no extra keys.\n\nSelection criteria\n- Choose the single best category that captures the main intent of the text.\n- If multiple categories seem plausible, pick the most probable one; do not return multiple.\n- If none fit perfectly, choose the closest allowed category. If the list includes "Other" or "Unknown", prefer it when appropriate.\n- Be robust to casing, punctuation, emojis, and minor typos. Handle negation correctly (e.g., "not spam" ≠ spam).\n- Never invent categories that are not in the provided list.\n\nBehavior\n- Be deterministic for the same input.\n- Do not ask clarifying questions; make the best choice with what\'s given.\n',
    title: "System Prompt",
    description: "The system prompt for the classifier"
  })
  declare system_prompt: any;

  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model to use for classification"
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "Text to classify"
  })
  declare text: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "Optional image to classify in context"
  })
  declare image: any;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "Optional audio to classify in context"
  })
  declare audio: any;

  @prop({
    type: "list[str]",
    default: [],
    title: "Categories",
    description:
      "List of possible categories. If empty, LLM will determine categories."
  })
  declare categories: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const text = asText(this.text ?? this.text ?? "");
    const categories = getCategories(this.categories ?? this.categories);
    if (categories.length < 2) {
      throw new Error("At least 2 categories are required");
    }

    const { providerId, modelId } = getModelConfig(this.serialize());
    if (hasProviderSupport(context, providerId, modelId)) {
      const provider = await context.getProvider(providerId);
      const result = await generateStructured(provider, {
        model: modelId,
        maxTokens: Number((this as any).max_tokens ?? 256),
        messages: [
          { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Allowed categories: ${categories.join(", ")}\n\nText: ${text}`
          }
        ],
        toolName: "classification_result",
        toolDescription: "Submit the classification result.",
        schema: {
          type: "object",
          properties: {
            category: { type: "string", enum: categories }
          },
          required: ["category"]
        }
      });
      const category = parseCategory(
        result ? String(result.category ?? "") : "",
        categories
      );
      return { output: category, category };
    }

    const tokens = tokenize(text);
    let best = categories[0];
    let bestScore = -1;
    for (const category of categories) {
      const catTokens = tokenize(category);
      let score = 0;
      for (const token of catTokens) {
        if (tokens.includes(token)) score += 1;
      }
      if (score > bestScore) {
        best = category;
        bestScore = score;
      }
    }
    return { output: best, category: best };
  }
}

export class AgentNode extends BaseNode {
  static readonly nodeType = "nodetool.agents.Agent";
  static readonly title = "Agent";
  static readonly description =
    "Generate natural language responses using LLM providers and streams output.\n    llm, text-generation, chatbot, question-answering, streaming";
  static readonly metadataOutputTypes = {
    text: "str",
    chunk: "chunk",
    thinking: "chunk",
    audio: "audio"
  };
  static readonly basicFields = ["prompt", "model", "tools", "image", "audio"];
  static readonly supportsDynamicOutputs = true;
  static readonly recommendedModels = [
    {
      id: "gpt-oss:20b",
      type: "llama_model",
      name: "GPT - OSS",
      repo_id: "gpt-oss:20b",
      description:
        "OpenAI's open-weight model excels at multi-tool routing and reasoning.",
      size_on_disk: 15032385536
    },
    {
      id: "qwen3-vl:4b",
      type: "llama_model",
      name: "Qwen3 VL - 4B",
      repo_id: "qwen3-vl:4b",
      description:
        "The most powerful vision-language model in the Qwen model family to date.",
      size_on_disk: 3543348019
    },
    {
      id: "qwen3-vl:8b",
      type: "llama_model",
      name: "Qwen3 VL - 8B",
      repo_id: "qwen3-vl:8b",
      description:
        "The most powerful vision-language model in the Qwen model family to date.",
      size_on_disk: 6549825126
    },
    {
      id: "gemma3:1b",
      type: "llama_model",
      name: "Gemma3 - 1B",
      repo_id: "gemma3:1b",
      description:
        "Gemma3 1B is a small model that can process text and images.",
      size_on_disk: 875099586
    },
    {
      id: "gemma3:4b",
      type: "llama_model",
      name: "Gemma3 - 4B",
      repo_id: "gemma3:4b",
      description:
        "Gemma3 4B is a small model that can process text and images.",
      size_on_disk: 3543348019
    },
    {
      id: "llama3.2:3b",
      type: "llama_model",
      name: "Llama 3.2 - 3B",
      repo_id: "llama3.2:3b",
      description:
        "Compact Llama 3.2 variant keeps latency low while following tool schemas accurately.",
      size_on_disk: 2040109465
    },
    {
      id: "qwen3:4b",
      type: "llama_model",
      name: "Qwen3 - 4B",
      repo_id: "qwen3:4b",
      description:
        "Qwen3 4B ships strong function-calling primitives and dependable multi-turn tool use.",
      size_on_disk: 2684354560
    },
    {
      id: "qwen3:8b",
      type: "llama_model",
      name: "Qwen3 - 8B",
      repo_id: "qwen3:8b",
      description:
        "Qwen3 8B ships strong function-calling primitives and dependable multi-turn tool use.",
      size_on_disk: 5583457484
    },
    {
      id: "deepseek-r1:8b",
      type: "mistral_model",
      name: "Deepseek R1 - 8B",
      repo_id: "deepseek-r1:8",
      description:
        "DeepSeek R1 8B balances reasoning with precise function calls for iterative agents.",
      size_on_disk: 5583457484
    },
    {
      id: "ggml-org/gpt-oss-20b-GGUF:gpt-oss-20b-mxfp4.gguf",
      type: "llama_cpp_model",
      name: "GPT-OSS 20B (GGUF)",
      repo_id: "ggml-org/gpt-oss-20b-GGUF",
      path: "gpt-oss-20b-mxfp4.gguf",
      description:
        "OpenAI's open-weight model in efficient MXFP4 format for llama.cpp.",
      size_on_disk: 9191230013,
      tags: [
        "gguf",
        "base_model:openai/gpt-oss-20b",
        "base_model:quantized:openai/gpt-oss-20b",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 156909,
      likes: 135
    },
    {
      id: "ggml-org/gemma-3-4b-it-GGUF:gemma-3-4b-it-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Gemma 3 4B IT (GGUF)",
      repo_id: "ggml-org/gemma-3-4b-it-GGUF",
      path: "gemma-3-4b-it-Q4_K_M.gguf",
      description:
        "Google's Gemma 3 4B in Q4_K_M quantization for efficient inference.",
      size_on_disk: 3113851289,
      pipeline_tag: "image-text-to-text",
      tags: [
        "gguf",
        "image-text-to-text",
        "arxiv:1905.07830",
        "arxiv:1905.10044",
        "arxiv:1911.11641",
        "arxiv:1904.09728",
        "arxiv:1705.03551",
        "arxiv:1911.01547",
        "arxiv:1907.10641",
        "arxiv:1903.00161",
        "arxiv:2009.03300",
        "arxiv:2304.06364",
        "arxiv:2103.03874",
        "arxiv:2110.14168",
        "arxiv:2311.12022",
        "arxiv:2108.07732",
        "arxiv:2107.03374",
        "arxiv:2210.03057",
        "arxiv:2106.03193",
        "arxiv:1910.11856",
        "arxiv:2502.12404",
        "arxiv:2502.21228",
        "arxiv:2404.16816",
        "arxiv:2104.12756",
        "arxiv:2311.16502",
        "arxiv:2203.10244",
        "arxiv:2404.12390",
        "arxiv:1810.12440",
        "arxiv:1908.02660",
        "arxiv:2312.11805",
        "base_model:google/gemma-3-4b-it",
        "base_model:quantized:google/gemma-3-4b-it",
        "license:gemma",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 25779,
      likes: 48
    },
    {
      id: "ggml-org/gemma-3-12b-it-GGUF:gemma-3-12b-it-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Gemma 3 12B IT (GGUF)",
      repo_id: "ggml-org/gemma-3-12b-it-GGUF",
      path: "gemma-3-12b-it-Q4_K_M.gguf",
      description:
        "Google's Gemma 3 12B in Q4_K_M quantization with strong reasoning.",
      size_on_disk: 7838315315,
      pipeline_tag: "image-text-to-text",
      tags: [
        "gguf",
        "image-text-to-text",
        "arxiv:1905.07830",
        "arxiv:1905.10044",
        "arxiv:1911.11641",
        "arxiv:1904.09728",
        "arxiv:1705.03551",
        "arxiv:1911.01547",
        "arxiv:1907.10641",
        "arxiv:1903.00161",
        "arxiv:2009.03300",
        "arxiv:2304.06364",
        "arxiv:2103.03874",
        "arxiv:2110.14168",
        "arxiv:2311.12022",
        "arxiv:2108.07732",
        "arxiv:2107.03374",
        "arxiv:2210.03057",
        "arxiv:2106.03193",
        "arxiv:1910.11856",
        "arxiv:2502.12404",
        "arxiv:2502.21228",
        "arxiv:2404.16816",
        "arxiv:2104.12756",
        "arxiv:2311.16502",
        "arxiv:2203.10244",
        "arxiv:2404.12390",
        "arxiv:1810.12440",
        "arxiv:1908.02660",
        "arxiv:2312.11805",
        "base_model:google/gemma-3-12b-it",
        "base_model:quantized:google/gemma-3-12b-it",
        "license:gemma",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 214667,
      likes: 30
    },
    {
      id: "ggml-org/Kimi-VL-A3B-Thinking-2506-GGUF:Kimi-VL-A3B-Thinking-2506-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Kimi VL A3B Thinking (GGUF)",
      repo_id: "ggml-org/Kimi-VL-A3B-Thinking-2506-GGUF",
      path: "Kimi-VL-A3B-Thinking-2506-Q4_K_M.gguf",
      description:
        "Moonshot AI's vision-language model with enhanced reasoning capabilities.",
      size_on_disk: 2362232012,
      tags: [
        "gguf",
        "base_model:moonshotai/Kimi-VL-A3B-Thinking-2506",
        "base_model:quantized:moonshotai/Kimi-VL-A3B-Thinking-2506",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 3039,
      likes: 29
    },
    {
      id: "ggml-org/Qwen3-Coder-30B-A3B-Instruct-Q8_0-GGUF:qwen3-coder-30b-a3b-instruct-q8_0.gguf",
      type: "llama_cpp_model",
      name: "Qwen3 Coder 30B A3B (GGUF)",
      repo_id: "ggml-org/Qwen3-Coder-30B-A3B-Instruct-Q8_0-GGUF",
      path: "qwen3-coder-30b-a3b-instruct-q8_0.gguf",
      description:
        "MoE coding model with 3B active params, excellent for code generation.",
      size_on_disk: 3865470566,
      pipeline_tag: "text-generation",
      tags: [
        "transformers",
        "gguf",
        "llama-cpp",
        "gguf-my-repo",
        "text-generation",
        "base_model:Qwen/Qwen3-Coder-30B-A3B-Instruct",
        "base_model:quantized:Qwen/Qwen3-Coder-30B-A3B-Instruct",
        "license:apache-2.0",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 80721,
      likes: 7
    },
    {
      id: "ggml-org/Qwen3-0.6B-GGUF:Qwen3-0.6B-Q4_0.gguf",
      type: "llama_cpp_model",
      name: "Qwen3 0.6B (GGUF)",
      repo_id: "ggml-org/Qwen3-0.6B-GGUF",
      path: "Qwen3-0.6B-Q4_0.gguf",
      description:
        "Ultra-lightweight Qwen3 for edge devices and fast inference.",
      size_on_disk: 429496729,
      tags: [
        "gguf",
        "base_model:Qwen/Qwen3-0.6B",
        "base_model:quantized:Qwen/Qwen3-0.6B",
        "license:apache-2.0",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 44304,
      likes: 13
    },
    {
      id: "ggml-org/gemma-3-270m-GGUF:gemma-3-270m-Q8_0.gguf",
      type: "llama_cpp_model",
      name: "Gemma 3 270M (GGUF)",
      repo_id: "ggml-org/gemma-3-270m-GGUF",
      path: "gemma-3-270m-Q8_0.gguf",
      description: "Tiny Gemma 3 for ultra-fast inference on CPU.",
      size_on_disk: 375809638,
      tags: [
        "gguf",
        "base_model:google/gemma-3-270m",
        "base_model:quantized:google/gemma-3-270m",
        "endpoints_compatible",
        "region:us"
      ],
      has_model_index: false,
      downloads: 595,
      likes: 19
    },
    {
      id: "ggml-org/gemma-3-27b-it-GGUF:gemma-3-27b-it-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Gemma 3 27B IT (GGUF)",
      repo_id: "ggml-org/gemma-3-27b-it-GGUF",
      path: "gemma-3-27b-it-Q4_K_M.gguf",
      description:
        "Google's largest Gemma 3 with strong reasoning and tool use.",
      size_on_disk: 16965120819,
      pipeline_tag: "image-text-to-text",
      tags: [
        "gguf",
        "image-text-to-text",
        "arxiv:1905.07830",
        "arxiv:1905.10044",
        "arxiv:1911.11641",
        "arxiv:1904.09728",
        "arxiv:1705.03551",
        "arxiv:1911.01547",
        "arxiv:1907.10641",
        "arxiv:1903.00161",
        "arxiv:2009.03300",
        "arxiv:2304.06364",
        "arxiv:2103.03874",
        "arxiv:2110.14168",
        "arxiv:2311.12022",
        "arxiv:2108.07732",
        "arxiv:2107.03374",
        "arxiv:2210.03057",
        "arxiv:2106.03193",
        "arxiv:1910.11856",
        "arxiv:2502.12404",
        "arxiv:2502.21228",
        "arxiv:2404.16816",
        "arxiv:2104.12756",
        "arxiv:2311.16502",
        "arxiv:2203.10244",
        "arxiv:2404.12390",
        "arxiv:1810.12440",
        "arxiv:1908.02660",
        "arxiv:2312.11805",
        "base_model:google/gemma-3-27b-it",
        "base_model:quantized:google/gemma-3-27b-it",
        "license:gemma",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 2604,
      likes: 23
    },
    {
      id: "Qwen/Qwen3-30B-A3B-GGUF:Qwen3-30B-A3B-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Qwen3 30B A3B (GGUF)",
      repo_id: "Qwen/Qwen3-30B-A3B-GGUF",
      path: "Qwen3-30B-A3B-Q4_K_M.gguf",
      description: "Qwen3 30B MoE model (3B active) in Q4_K_M quantization.",
      size_on_disk: 19327352832,
      pipeline_tag: "text-generation",
      tags: [
        "gguf",
        "text-generation",
        "arxiv:2309.00071",
        "arxiv:2505.09388",
        "base_model:Qwen/Qwen3-30B-A3B",
        "base_model:quantized:Qwen/Qwen3-30B-A3B",
        "license:apache-2.0",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 17644,
      likes: 65
    },
    {
      id: "Qwen/Qwen3-32B-GGUF:Qwen3-32B-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Qwen3 32B (GGUF)",
      repo_id: "Qwen/Qwen3-32B-GGUF",
      path: "Qwen3-32B-Q4_K_M.gguf",
      description: "Qwen3 32B dense model in Q4_K_M quantization.",
      size_on_disk: 20401094656,
      pipeline_tag: "text-generation",
      tags: [
        "gguf",
        "text-generation",
        "arxiv:2309.00071",
        "base_model:Qwen/Qwen3-32B",
        "base_model:quantized:Qwen/Qwen3-32B",
        "license:apache-2.0",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 27381,
      likes: 64
    },
    {
      id: "Qwen/Qwen3-14B-GGUF:Qwen3-14B-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Qwen3 14B (GGUF)",
      repo_id: "Qwen/Qwen3-14B-GGUF",
      path: "Qwen3-14B-Q4_K_M.gguf",
      description: "Qwen3 14B dense model in Q4_K_M quantization.",
      size_on_disk: 9663676416,
      pipeline_tag: "text-generation",
      tags: [
        "gguf",
        "text-generation",
        "arxiv:2309.00071",
        "base_model:Qwen/Qwen3-14B",
        "base_model:quantized:Qwen/Qwen3-14B",
        "license:apache-2.0",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 61212,
      likes: 73
    },
    {
      id: "Qwen/Qwen3-8B-GGUF:Qwen3-8B-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Qwen3 8B (GGUF)",
      repo_id: "Qwen/Qwen3-8B-GGUF",
      path: "Qwen3-8B-Q4_K_M.gguf",
      description: "Qwen3 8B dense model in Q4_K_M quantization.",
      size_on_disk: 5368709120,
      pipeline_tag: "text-generation",
      tags: [
        "gguf",
        "text-generation",
        "arxiv:2309.00071",
        "arxiv:2505.09388",
        "base_model:Qwen/Qwen3-8B",
        "base_model:quantized:Qwen/Qwen3-8B",
        "license:apache-2.0",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 94189,
      likes: 156
    },
    {
      id: "Qwen/Qwen3-4B-GGUF:Qwen3-4B-Q4_K_M.gguf",
      type: "llama_cpp_model",
      name: "Qwen3 4B (GGUF)",
      repo_id: "Qwen/Qwen3-4B-GGUF",
      path: "Qwen3-4B-Q4_K_M.gguf",
      description: "Qwen3 4B dense model in Q4_K_M quantization.",
      size_on_disk: 2684354560,
      pipeline_tag: "text-generation",
      tags: [
        "gguf",
        "text-generation",
        "arxiv:2309.00071",
        "arxiv:2505.09388",
        "base_model:Qwen/Qwen3-4B",
        "base_model:quantized:Qwen/Qwen3-4B",
        "license:apache-2.0",
        "endpoints_compatible",
        "region:us",
        "conversational"
      ],
      has_model_index: false,
      downloads: 48252,
      likes: 84
    }
  ];

  static readonly isStreamingOutput = true;
  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model to use for execution"
  })
  declare model: any;

  @prop({
    type: "str",
    default: "loop",
    title: "Mode",
    description:
      "Agent execution mode: 'loop' for simple tool calling, 'plan' for automatic task planning, 'multi-agent' for parallel sub-agents"
  })
  declare mode: any;

  @prop({
    type: "str",
    default: "You are a friendly assistant",
    title: "System",
    description: "The system prompt for the LLM"
  })
  declare system: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The prompt for the LLM"
  })
  declare prompt: any;

  @prop({
    type: "list[tool_name]",
    default: [],
    title: "Tools",
    description:
      "Tools to enable for the agent. Select workspace tools (read_file, write_file, list_directory) to enable file operations."
  })
  declare tools: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The image to analyze"
  })
  declare image: any;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "The audio to analyze"
  })
  declare audio: any;

  @prop({
    type: "list[message]",
    default: [],
    title: "Messages",
    description: "The messages for the LLM"
  })
  declare history: any;

  @prop({
    type: "str",
    default: "",
    title: "Thread ID",
    description:
      "Optional thread ID for persistent conversation history. If provided, messages will be loaded from and saved to this thread."
  })
  declare thread_id: any;

  @prop({
    type: "int",
    default: 8192,
    title: "Max Tokens",
    min: 1,
    max: 100000
  })
  declare max_tokens: any;

  @prop({
    type: "int",
    default: 3,
    title: "Num Agents",
    description: "Number of sub-agents to auto-specialize in multi-agent mode",
    min: 2,
    max: 10
  })
  declare num_agents: any;

  @prop({
    type: "str",
    default: "coordinator",
    title: "Team Strategy",
    description:
      "Team strategy for multi-agent mode: 'coordinator', 'autonomous', or 'hybrid'"
  })
  declare team_strategy: any;

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const { providerId, modelId } = getModelConfig(this.serialize());
    log.info("AgentNode starting", {
      nodeId: this.__node_id ?? null,
      providerId,
      modelId,
      hasContext: Boolean(context),
      hasGetProvider: Boolean(
        context && typeof context.getProvider === "function"
      ),
      propKeys: Object.keys(this.serialize()),
      inputKeys: Object.keys(this.serialize())
    });
    if (!providerId || !modelId) {
      log.error("AgentNode missing model selection", {
        nodeId: this.__node_id ?? null,
        providerId,
        modelId,
        modelInput: this.model ?? null,
        modelProp: this.model ?? null
      });
      throw new Error("Select a model");
    }
    if (!context || typeof context.getProvider !== "function") {
      log.error("AgentNode missing processing context or provider access", {
        nodeId: this.__node_id ?? null,
        providerId,
        modelId
      });
      throw new Error("Processing context is required");
    }

    // --- Multi-mode dispatch for "plan" and "multi-agent" modes ---
    const agentMode = String(this.mode ?? "loop").trim();
    if (agentMode === "plan" || agentMode === "multi-agent") {
      yield* this.genProcessMultiMode(
        context,
        providerId,
        modelId,
        agentMode as "plan" | "multi-agent"
      );
      return;
    }

    const prompt = asText(this.prompt ?? this.prompt ?? "");
    const system = asText(this.system ?? this.system ?? DEFAULT_SYSTEM_PROMPT);
    const image = this.image ?? this.image;
    const audio = this.audio ?? this.audio;
    const historyInput = this.history ?? this.history;
    const history = Array.isArray(historyInput)
      ? historyInput
          .map((item) => normalizeMessage(item))
          .filter((item): item is Message => item !== null)
      : [];
    const threadId = String(this.thread_id ?? this.thread_id ?? "").trim();
    const maxTokens = Number(this.max_tokens ?? this.max_tokens ?? 8192);
    const tools: ToolLike[] = normalizeTools(this.tools ?? this.tools);

    // Build control tools from _control_context (injected by the kernel
    // for nodes that have outgoing control edges). This lets the LLM
    // call controlled nodes as tools.
    const controlContext = (this as any)._control_context;
    const controlTools = buildControlTools(controlContext);
    if (controlTools.length > 0) {
      tools.push(...controlTools);
      log.info("AgentNode added control tools", {
        nodeId: this.__node_id ?? null,
        controlToolNames: controlTools.map((t) => t.name),
        controlTargets: controlTools.map((t) => t.targetNodeId)
      });
    }

    const structuredSchema = getStructuredOutputSchema(this);

    const messages: Message[] = [
      { role: "system", content: system },
      ...(await loadThreadMessages(context, threadId)),
      ...history,
      buildUserMessage(prompt, image, audio)
    ];
    log.info("AgentNode prepared messages", {
      nodeId: this.__node_id ?? null,
      providerId,
      modelId,
      threadId: threadId || null,
      promptLength: prompt.length,
      historyCount: history.length,
      toolCount: tools.length,
      messageCount: messages.length,
      hasImage: hasContentType(messages[messages.length - 1], "image"),
      hasAudio: hasContentType(messages[messages.length - 1], "audio")
    });

    if (threadId) {
      await saveThreadMessage(context, threadId, messages[messages.length - 1]);
    }

    let lastTextOutput: string | null = null;
    const providerTools = tools.length > 0 ? toProviderTools(tools) : undefined;
    const provider = await context.getProvider(providerId);

    // --- Agentic provider fast-path (e.g. Claude Agent SDK with MCP) ---
    // The provider handles the full tool-calling loop internally.
    // We provide an onToolCall callback so tools execute natively via MCP.
    if (isAgenticProvider(provider) && tools.length > 0) {
      log.info("AgentNode using agentic provider path", {
        nodeId: this.__node_id ?? null,
        providerId,
        modelId,
        toolCount: tools.length
      });

      // Build onToolCall callback that bridges into our tool set
      const onToolCall = async (
        name: string,
        args: Record<string, unknown>
      ): Promise<string> => {
        const tool = tools.find((t) => t.name === name);
        if (!tool || typeof tool.process !== "function") {
          return JSON.stringify({ error: `Unknown tool: ${name}` });
        }

        if (isControlTool(tool)) {
          const callArgs = args ?? {};
          if (context.hasControlEventSupport) {
            try {
              const controlResult = await context.sendControlEvent(
                tool.targetNodeId,
                callArgs
              );
              return JSON.stringify({
                status: "completed",
                target_node_id: tool.targetNodeId,
                result: controlResult
              });
            } catch (err) {
              return JSON.stringify({
                status: "error",
                target_node_id: tool.targetNodeId,
                error: err instanceof Error ? err.message : String(err)
              });
            }
          }
          return JSON.stringify({
            status: "error",
            error: "Control event dispatch unavailable"
          });
        }

        try {
          const result = await tool.process(context, args);
          return typeof result === "string"
            ? result
            : JSON.stringify(serializeToolResult(result));
        } catch (e) {
          return JSON.stringify({ error: String(e) });
        }
      };

      let assistantText = "";
      const assistantToolCalls: ToolCall[] = [];

      for await (const item of streamProviderMessages(provider, {
        messages,
        model: modelId,
        tools: providerTools,
        maxTokens,
        threadId: threadId || undefined,
        onToolCall
      })) {
        if (isChunkItem(item)) {
          if (item.thinking) {
            yield { chunk: null, thinking: item, text: null, audio: null };
          } else if (item.content_type === "audio") {
            yield { chunk: item, thinking: null, text: null, audio: null };
            const audioBytes = item.content
              ? Buffer.from(item.content, "base64")
              : Buffer.alloc(0);
            yield {
              chunk: null,
              thinking: null,
              text: null,
              audio: { data: new Uint8Array(audioBytes) }
            };
          } else {
            assistantText += item.content ?? "";
            yield { chunk: item, thinking: null, text: null, audio: null };
          }
        }
        if (isToolCallItem(item)) {
          assistantToolCalls.push(item);
          log.info("AgentNode MCP tool executed", {
            nodeId: this.__node_id ?? null,
            toolName: item.name
          });
        }
      }

      if (assistantText) {
        lastTextOutput = assistantText;
        yield { chunk: null, thinking: null, text: assistantText, audio: null };
      }

      // Save messages to thread
      if (assistantText || assistantToolCalls.length > 0) {
        const assistantMessage: Message = {
          role: "assistant",
          content: [{ type: "text", text: assistantText }],
          toolCalls: assistantToolCalls.length > 0 ? assistantToolCalls : null
        };
        messages.push(assistantMessage);
        await saveThreadMessage(context, threadId, assistantMessage);
      }

      log.info("AgentNode agentic path completed", {
        nodeId: this.__node_id ?? null,
        textLength: assistantText.length,
        toolCallCount: assistantToolCalls.length
      });
    } else {
      // --- Standard multi-iteration loop (for non-agentic providers) ---
      let shouldContinue = false;
      let firstIteration = true;

      while (firstIteration || shouldContinue) {
        firstIteration = false;
        shouldContinue = false;
        log.info("AgentNode provider iteration starting", {
          nodeId: this.__node_id ?? null,
          providerId,
          modelId,
          threadId: threadId || null,
          messageCount: messages.length
        });
        const assistantToolCalls: ToolCall[] = [];
        let assistantText = "";
        let chunkCount = 0;
        let thinkingCount = 0;
        let audioChunkCount = 0;

        for await (const item of streamProviderMessages(provider, {
          messages,
          model: modelId,
          tools: providerTools,
          maxTokens,
          threadId: threadId || undefined
        })) {
          if (isChunkItem(item)) {
            chunkCount += 1;
            if (item.thinking) {
              thinkingCount += 1;
              yield { chunk: null, thinking: item, text: null, audio: null };
              continue;
            }
            if (item.content_type === "audio") {
              audioChunkCount += 1;
              yield { chunk: item, thinking: null, text: null, audio: null };
              const audioBytes = item.content
                ? Buffer.from(item.content, "base64")
                : Buffer.alloc(0);
              yield {
                chunk: null,
                thinking: null,
                text: null,
                audio: { data: new Uint8Array(audioBytes) }
              };
            } else {
              assistantText += item.content ?? "";
              yield { chunk: item, thinking: null, text: null, audio: null };
            }
            continue;
          }
          if (isToolCallItem(item)) {
            assistantToolCalls.push(item);
            log.info("AgentNode received tool call", {
              nodeId: this.__node_id ?? null,
              providerId,
              modelId,
              toolCallId: item.id,
              toolName: item.name,
              argKeys: Object.keys(item.args ?? {})
            });
          }
        }

        log.info("AgentNode provider iteration completed", {
          nodeId: this.__node_id ?? null,
          providerId,
          modelId,
          chunkCount,
          thinkingCount,
          audioChunkCount,
          toolCallCount: assistantToolCalls.length,
          assistantTextLength: assistantText.length
        });

        if (assistantText) {
          lastTextOutput = assistantText;
          yield {
            chunk: null,
            thinking: null,
            text: assistantText,
            audio: null
          };
        }

        if (assistantText || assistantToolCalls.length > 0) {
          const assistantMessage: Message = {
            role: "assistant",
            content: [{ type: "text", text: assistantText }],
            toolCalls: assistantToolCalls.length > 0 ? assistantToolCalls : null
          };
          messages.push(assistantMessage);
          await saveThreadMessage(context, threadId, assistantMessage);
        }

        for (const toolCall of assistantToolCalls) {
          const tool = tools.find(
            (candidate) => candidate.name === toolCall.name
          );
          if (!tool || typeof tool.process !== "function") {
            log.warn("AgentNode tool call had no matching executable tool", {
              nodeId: this.__node_id ?? null,
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              availableTools: tools.map((candidate) => candidate.name)
            });
            continue;
          }

          let result: unknown;

          if (isControlTool(tool)) {
            const callArgs = toolCall.args ?? {};
            log.info("AgentNode dispatching control tool", {
              nodeId: this.__node_id ?? null,
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              targetNodeId: tool.targetNodeId,
              argKeys: Object.keys(callArgs)
            });

            if (context.hasControlEventSupport) {
              try {
                const controlResult = await context.sendControlEvent(
                  tool.targetNodeId,
                  callArgs
                );
                result = {
                  status: "completed",
                  target_node_id: tool.targetNodeId,
                  result: controlResult
                };
              } catch (err) {
                result = {
                  status: "error",
                  target_node_id: tool.targetNodeId,
                  error: err instanceof Error ? err.message : String(err)
                };
              }
            } else {
              result = {
                status: "error",
                target_node_id: tool.targetNodeId,
                error:
                  "Control event dispatch is not available in this execution context"
              };
            }
          } else {
            log.info("AgentNode executing tool", {
              nodeId: this.__node_id ?? null,
              toolCallId: toolCall.id,
              toolName: toolCall.name
            });
            result = await tool.process(context, toolCall.args);
          }

          const toolMessage: Message = {
            role: "tool",
            toolCallId: toolCall.id,
            content: JSON.stringify(serializeToolResult(result))
          };
          messages.push(toolMessage);
          await saveThreadMessage(context, threadId, toolMessage);
          shouldContinue = true;
        }
      }
    }

    if (structuredSchema) {
      if (!lastTextOutput) {
        log.error("AgentNode structured output missing text payload", {
          nodeId: this.__node_id ?? null,
          providerId,
          modelId
        });
        throw new Error("Agent did not return structured output text");
      }
      let parsed = extractJson(lastTextOutput);
      if (!parsed) {
        // The LLM returned plain text instead of JSON. Rather than failing
        // the workflow, build a best-effort result by assigning the raw text
        // to each required string field in the schema.
        log.warn(
          "AgentNode structured output was not valid JSON, falling back to raw text",
          {
            nodeId: this.__node_id ?? null,
            providerId,
            modelId,
            textPreview: lastTextOutput.slice(0, 200)
          }
        );
        const props =
          (
            structuredSchema as {
              properties?: Record<string, { type?: string }>;
            }
          ).properties ?? {};
        const fallback: Record<string, unknown> = {};
        for (const [name, spec] of Object.entries(props)) {
          if (spec.type === "string") {
            fallback[name] = lastTextOutput.trim();
          } else {
            fallback[name] = null;
          }
        }
        parsed = fallback;
      }
      const required = Array.isArray(
        (structuredSchema as { required?: unknown }).required
      )
        ? ((structuredSchema as { required: string[] }).required ?? [])
        : [];
      for (const name of required) {
        if (!(name in parsed)) {
          log.error("AgentNode structured output missing required field", {
            nodeId: this.__node_id ?? null,
            missingField: name,
            parsedKeys: Object.keys(parsed)
          });
          throw new Error(
            `Agent structured output is missing required field '${name}'`
          );
        }
      }
      log.info("AgentNode yielding structured output", {
        nodeId: this.__node_id ?? null,
        keys: Object.keys(parsed)
      });
      yield parsed;
    }

    log.info("AgentNode completed", {
      nodeId: this.__node_id ?? null,
      providerId,
      modelId,
      finalTextLength: lastTextOutput?.length ?? 0,
      returnedStructured: Boolean(structuredSchema)
    });
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    let lastText = "";
    let lastAudio: Record<string, unknown> | null = null;
    let structuredResult: Record<string, unknown> | null = null;

    for await (const item of this.genProcess(context)) {
      if (
        "chunk" in item ||
        "thinking" in item ||
        "text" in item ||
        "audio" in item
      ) {
        if (typeof item.text === "string") {
          lastText = item.text;
        }
        if (item.audio && typeof item.audio === "object") {
          lastAudio = item.audio as Record<string, unknown>;
        }
      } else {
        structuredResult = item;
      }
    }

    if (structuredResult) {
      log.info("AgentNode process() returning structured result", {
        nodeId: this.__node_id ?? null,
        keys: Object.keys(structuredResult)
      });
      return structuredResult;
    }

    log.info("AgentNode process() returning aggregate result", {
      nodeId: this.__node_id ?? null,
      textLength: lastText.length,
      hasAudio: Boolean(lastAudio)
    });
    return {
      text: lastText,
      output: lastText,
      chunk: null,
      thinking: null,
      audio: lastAudio
    };
  }

  /**
   * Dispatch to MultiModeAgent for "plan" and "multi-agent" modes.
   * Converts ToolLike[] to AgentTool[] and bridges ProcessingMessage to node outputs.
   */
  private async *genProcessMultiMode(
    context: ProcessingContext,
    providerId: string,
    modelId: string,
    mode: "plan" | "multi-agent"
  ): AsyncGenerator<Record<string, unknown>> {
    const prompt = asText(this.prompt ?? "");
    const system = asText(this.system ?? DEFAULT_SYSTEM_PROMPT);
    const rawTools: ToolLike[] = normalizeTools(this.tools ?? []);

    // Build control tools
    const controlContext = (this as any)._control_context;
    const controlTools = buildControlTools(controlContext);
    if (controlTools.length > 0) {
      rawTools.push(...controlTools);
    }

    // Convert ToolLike[] to AgentTool[] for MultiModeAgent
    const agentTools = rawTools.map((t) => new ToolLikeAdapter(t));

    const provider = await context.getProvider(providerId);

    const agent = new MultiModeAgent({
      name: `AgentNode_${this.__node_id ?? "default"}`,
      objective: prompt,
      provider,
      model: modelId,
      mode,
      tools: agentTools,
      systemPrompt: system,
      maxTokenLimit: Number(this.max_tokens ?? 8192),
      outputSchema: getStructuredOutputSchema(this) ?? undefined,
      // Plan mode options
      planningModel: modelId,
      maxSteps: 10,
      maxStepIterations: 5,
      // Multi-agent options
      numSubAgents: Number(this.num_agents ?? 3),
      teamStrategy: (this.team_strategy ?? "coordinator") as
        | "coordinator"
        | "autonomous"
        | "hybrid",
      maxConcurrency: 5
    });

    let lastText = "";

    for await (const msg of agent.execute(context)) {
      const pmsg = msg as ProcessingMessage;
      if (pmsg.type === "chunk") {
        const chunk = pmsg as Chunk;
        const content = chunk.content ?? "";
        lastText += content;
        yield {
          chunk: { type: "chunk", content, done: false },
          thinking: null,
          text: null,
          audio: null
        };
      } else if (pmsg.type === "step_result") {
        const result = (pmsg as any).result;
        if (result != null) {
          const resultText =
            typeof result === "string" ? result : JSON.stringify(result);
          lastText = resultText;
        }
      } else if (pmsg.type === "log_update") {
        log.info("MultiModeAgent log", {
          nodeId: this.__node_id ?? null,
          content: (pmsg as any).content
        });
      }
    }

    const resultText =
      lastText ||
      (agent.getResults() != null
        ? typeof agent.getResults() === "string"
          ? (agent.getResults() as string)
          : JSON.stringify(agent.getResults())
        : "");

    yield { chunk: null, thinking: null, text: resultText, audio: null };
    return {
      text: resultText,
      output: resultText,
      chunk: null,
      thinking: null,
      audio: null
    };
  }
}

export const AGENT_NODES = [
  SummarizerNode,
  CreateThreadNode,
  ExtractorNode,
  ClassifierNode,
  AgentNode
] as const;
