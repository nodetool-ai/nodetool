import type { Chunk } from "@nodetool-ai/protocol";
import { importOptionalModule, importNodeBuiltin } from "@nodetool-ai/config";
import { BaseProvider } from "./base-provider.js";
import type {
  EmbeddingModel,
  LanguageModel,
  Message,
  MessageContent,
  ProviderStreamItem,
  ProviderTool,
  ToolCall
} from "./types.js";

/**
 * Minimal typed surface of the optional `node-llama-cpp` native binding. The
 * package ships its own full types, but it is an optional dependency that may
 * not be installed (cloud deploys, web-only dev), so we describe only the slice
 * we call here and load it lazily via {@link importOptionalModule}. Keeping the
 * contract local means this file type-checks whether or not the native package
 * is present.
 */
interface NodeLlamaModule {
  getLlama(options?: NodeLlamaOptions): Promise<NodeLlama>;
}

interface NodeLlamaOptions {
  /** GPU backend; `false` forces CPU, `"auto"` lets the binding detect. */
  gpu?: "auto" | "metal" | "cuda" | "vulkan" | false;
}

interface NodeLlama {
  loadModel(options: { modelPath: string }): Promise<NodeLlamaModel>;
}

interface NodeLlamaModel {
  createContext(options?: {
    contextSize?: number;
  }): Promise<NodeLlamaContext>;
  createEmbeddingContext(options?: {
    contextSize?: number;
  }): Promise<NodeLlamaEmbeddingContext>;
  dispose(): Promise<void>;
}

interface NodeLlamaContext {
  getSequence(): NodeLlamaContextSequence;
  dispose(): Promise<void>;
}

// The sequence is an opaque handle passed back to the chat session.
type NodeLlamaContextSequence = object;

interface NodeLlamaEmbedding {
  vector: readonly number[];
}

interface NodeLlamaEmbeddingContext {
  getEmbeddingFor(text: string): Promise<NodeLlamaEmbedding>;
  dispose(): Promise<void>;
}

/** A resolved function call in the chat history: the arguments the model
 * produced plus the result it was handed back. Replaying prior tool rounds as
 * these (rather than as prose) keeps the model's own function-calling syntax
 * in the transcript, which is what its template was trained on. */
interface ChatModelFunctionCall {
  type: "functionCall";
  name: string;
  description?: string;
  params: unknown;
  result: unknown;
  startsNewChunk?: boolean;
}

type ChatHistoryItem =
  | { type: "system"; text: string }
  | { type: "user"; text: string }
  | { type: "model"; response: (string | ChatModelFunctionCall)[] };

interface ChatSessionOptions {
  contextSequence: NodeLlamaContextSequence;
  systemPrompt?: string;
}

/** A single function exposed to the model, in node-llama-cpp's own shape:
 * a JSON-schema `params` describing the arguments, and a `handler` the
 * library invokes with the parsed (and grammar-validated) arguments once the
 * model finishes generating a call. `defineChatSessionFunction` is an
 * identity helper on the library side that exists purely to infer `params` ↔
 * `handler` argument types together; we don't rely on that inference here. */
interface ChatSessionModelFunction {
  description?: string;
  params?: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<unknown> | unknown;
}

type ChatSessionModelFunctions = Record<string, ChatSessionModelFunction>;

type DefineChatSessionFunction = (
  definition: ChatSessionModelFunction
) => ChatSessionModelFunction;

interface PromptOptions {
  onTextChunk?: (chunk: string) => void;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  signal?: AbortSignal;
  /** Ends generation without throwing once `signal` fires, keeping whatever
   * text was produced so far — used to stop right after a function call is
   * captured when there is no {@link onToolCall} to resolve it. */
  stopOnAbortSignal?: boolean;
  /** Native, grammar-constrained function calling: the model can only emit a
   * call matching one of these schemas, so no text-based parsing is needed. */
  functions?: ChatSessionModelFunctions;
}

interface NodeLlamaChatSession {
  setChatHistory(history: ChatHistoryItem[]): void;
  prompt(text: string, options?: PromptOptions): Promise<string>;
}

interface ChatSessionCtor {
  new (options: ChatSessionOptions): NodeLlamaChatSession;
}

let _modulePromise: Promise<{
  getLlama: NodeLlamaModule["getLlama"];
  LlamaChatSession: ChatSessionCtor;
  defineChatSessionFunction: DefineChatSessionFunction;
}> | null = null;

async function loadNodeLlamaCpp(): Promise<{
  getLlama: NodeLlamaModule["getLlama"];
  LlamaChatSession: ChatSessionCtor;
  defineChatSessionFunction: DefineChatSessionFunction;
}> {
  if (!_modulePromise) {
    _modulePromise = (async () => {
      try {
        const mod = await importOptionalModule<{
          getLlama: NodeLlamaModule["getLlama"];
          LlamaChatSession: ChatSessionCtor;
          defineChatSessionFunction: DefineChatSessionFunction;
        }>("node-llama-cpp");
        return {
          getLlama: mod.getLlama,
          LlamaChatSession: mod.LlamaChatSession,
          defineChatSessionFunction: mod.defineChatSessionFunction
        };
      } catch (err) {
        _modulePromise = null;
        throw new Error(
          "The local llama.cpp provider requires the optional 'node-llama-cpp' " +
            "package, which is not installed. Install it from the Package " +
            "Manager to run GGUF models in-process.",
          { cause: err as Error }
        );
      }
    })();
  }
  return _modulePromise;
}

/** Platform default directory for downloaded GGUF models. Mirrors the location
 * `@nodetool-ai/huggingface`'s `getLlamaCppCacheDir` writes to, so models
 * fetched through the existing download path resolve without extra config. */
async function getDefaultModelsDir(): Promise<string> {
  const os = await importNodeBuiltin<typeof import("node:os")>("node:os");
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  if (!os || !path) {
    throw new Error("node-llama-cpp provider requires a Node.js runtime");
  }
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Caches", "llama.cpp");
  }
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    return localAppData
      ? path.join(localAppData, "llama.cpp")
      : path.join(home, ".cache", "llama.cpp");
  }
  return path.join(home, ".cache", "llama.cpp");
}

function asText(content: Message["content"]): string {
  if (typeof content === "string") return content;
  if (!content) return "";
  return content
    .filter(
      (c): c is MessageContent & { type: "text"; text: string } =>
        c.type === "text"
    )
    .map((c) => c.text)
    .join("\n");
}

/**
 * In-process llama.cpp provider backed by the native `node-llama-cpp` binding.
 * Unlike {@link LlamaProvider} (an HTTP client for a remote `llama-server`),
 * this runs inference directly in the backend process: no port, no health
 * check, no external process. Models are GGUF files loaded on demand and kept
 * in a small cache so switching models never restarts anything.
 *
 * Tool calling uses node-llama-cpp's native `functions` API: each
 * {@link ProviderTool} becomes a `defineChatSessionFunction` whose `handler`
 * either bridges to the harness's `onToolCall` (agentic loop — the library
 * runs the whole multi-call round internally and returns the final text) or,
 * when no `onToolCall` is supplied, records the call and aborts generation so
 * it can be returned to the caller unexecuted, matching every other
 * provider's `generateMessages`/`generateMessage` contract.
 */
export class NodeLlamaCppProvider extends BaseProvider {
  static requiredSecrets(): string[] {
    return [];
  }

  private readonly modelsDir?: string;
  private readonly gpuBackend?: "auto" | "metal" | "cuda" | "vulkan" | "cpu";
  private _llama: NodeLlama | null = null;
  private readonly _models = new Map<string, NodeLlamaModel>();

  constructor(
    secrets: {
      NODE_LLAMA_CPP_MODELS_DIR?: string;
      NODE_LLAMA_CPP_GPU_BACKEND?: string;
    } = {}
  ) {
    super("node_llama_cpp");
    this.modelsDir =
      secrets.NODE_LLAMA_CPP_MODELS_DIR ||
      process.env.NODE_LLAMA_CPP_MODELS_DIR ||
      undefined;
    const backend = (
      secrets.NODE_LLAMA_CPP_GPU_BACKEND ||
      process.env.NODE_LLAMA_CPP_GPU_BACKEND ||
      ""
    ).toLowerCase();
    this.gpuBackend =
      backend === "metal" ||
      backend === "cuda" ||
      backend === "vulkan" ||
      backend === "cpu" ||
      backend === "auto"
        ? (backend as NodeLlamaCppProvider["gpuBackend"])
        : undefined;
  }

  getContainerEnv(): Record<string, string> {
    return {};
  }

  async hasToolSupport(_model: string): Promise<boolean> {
    // node-llama-cpp's `functions` API constrains generation with a grammar
    // derived from each tool's schema, so every GGUF model gets real function
    // calling regardless of its chat template's native support.
    return true;
  }

  private async resolveModelsDir(): Promise<string> {
    return this.modelsDir ?? (await getDefaultModelsDir());
  }

  private async getLlama(): Promise<NodeLlama> {
    if (!this._llama) {
      const { getLlama } = await loadNodeLlamaCpp();
      const gpu: NodeLlamaOptions["gpu"] | undefined =
        this.gpuBackend === "cpu"
          ? false
          : this.gpuBackend === undefined
            ? undefined
            : this.gpuBackend;
      this._llama = await getLlama(gpu === undefined ? undefined : { gpu });
    }
    return this._llama;
  }

  /** Resolve a model id (absolute path, or a GGUF filename under the models
   * directory) to a loaded model, caching the handle for reuse. */
  private async getOrLoadModel(model: string): Promise<NodeLlamaModel> {
    const cached = this._models.get(model);
    if (cached) return cached;

    const path = await importNodeBuiltin<typeof import("node:path")>(
      "node:path"
    );
    if (!path) {
      throw new Error("node-llama-cpp provider requires a Node.js runtime");
    }
    const modelPath = path.isAbsolute(model)
      ? model
      : path.join(await this.resolveModelsDir(), model);

    const llama = await this.getLlama();
    const loaded = await llama.loadModel({ modelPath });
    this._models.set(model, loaded);
    return loaded;
  }

  /** Split a message array into a system prompt, the prior-turn history, and
   * the final user turn to prompt with. An assistant turn that called tools is
   * rejoined with its `tool` result messages into one model turn carrying
   * native `functionCall` items, so a resumed conversation replays prior calls
   * in the model's own syntax. */
  private buildChat(messages: Message[]): {
    systemPrompt: string;
    history: ChatHistoryItem[];
    lastUserText: string;
  } {
    const systemParts: string[] = [];
    const results = new Map<string, string>();
    for (const msg of messages) {
      if (msg.role === "system") systemParts.push(asText(msg.content));
      else if (msg.role === "tool" && msg.toolCallId)
        results.set(msg.toolCallId, asText(msg.content));
    }

    const history: ChatHistoryItem[] = [];
    for (const msg of messages) {
      if (msg.role === "system" || msg.role === "tool") continue;
      if (msg.role === "assistant") {
        const text = asText(msg.content);
        const response: (string | ChatModelFunctionCall)[] = text ? [text] : [];
        (msg.toolCalls ?? []).forEach((tc, index) => {
          response.push({
            type: "functionCall",
            name: tc.name,
            params: tc.args ?? {},
            result: results.get(tc.id) ?? "",
            startsNewChunk: index === 0
          });
        });
        history.push({ type: "model", response });
      } else {
        history.push({ type: "user", text: asText(msg.content) });
      }
    }

    // `prompt()` always appends a user turn, so the final user message becomes
    // the prompt text rather than part of the replayed history. When the
    // conversation ends on a tool result there is no trailing user turn — the
    // model is meant to continue from the function results already in history.
    let lastUserText = "";
    const last = history[history.length - 1];
    if (last?.type === "user") {
      lastUserText = last.text;
      history.pop();
    }

    return {
      systemPrompt: systemParts.filter(Boolean).join("\n"),
      history,
      lastUserText
    };
  }

  private async createSession(
    model: string,
    messages: Message[]
  ): Promise<{
    session: NodeLlamaChatSession;
    lastUserText: string;
    dispose: () => Promise<void>;
  }> {
    const { LlamaChatSession } = await loadNodeLlamaCpp();
    const loaded = await this.getOrLoadModel(model);
    const context = await loaded.createContext();
    const { systemPrompt, history, lastUserText } = this.buildChat(messages);
    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: systemPrompt || undefined
    });
    if (history.length > 0) {
      session.setChatHistory(
        systemPrompt
          ? [{ type: "system", text: systemPrompt }, ...history]
          : history
      );
    }
    return {
      session,
      lastUserText,
      dispose: () => context.dispose()
    };
  }

  /**
   * Build node-llama-cpp's native `functions` map from our provider-agnostic
   * tools. Each handler either bridges to `onToolCall` (the harness's
   * in-process tool executor — see {@link BaseProvider.generateLoop}'s
   * `executeTool`, which the caller wraps into this callback) so the whole
   * call-and-continue round happens inside this one `prompt()`, or — when no
   * executor is wired up — records the call and fires `stopGeneration` so the
   * (unexecuted) call can be returned to the caller like every other
   * provider's native tool calling.
   */
  private buildToolFunctions(
    tools: ProviderTool[],
    onToolCall: ((name: string, args: Record<string, unknown>) => Promise<string>) | undefined,
    defineChatSessionFunction: DefineChatSessionFunction,
    pendingCalls: ToolCall[],
    stopGeneration: () => void
  ): ChatSessionModelFunctions | undefined {
    if (tools.length === 0) return undefined;
    const functions: ChatSessionModelFunctions = {};
    let seq = 0;
    for (const tool of tools) {
      functions[tool.name] = defineChatSessionFunction({
        description: tool.description,
        params: tool.inputSchema ?? { type: "object", properties: {} },
        handler: async (params: Record<string, unknown>) => {
          if (onToolCall) {
            return await onToolCall(tool.name, params);
          }
          pendingCalls.push({ id: `call_${++seq}`, name: tool.name, args: params });
          stopGeneration();
          return "";
        }
      });
    }
    return functions;
  }

  async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    onToolCall?: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<string>;
    signal?: AbortSignal;
  }): AsyncGenerator<ProviderStreamItem> {
    const { model, tools = [], maxTokens = 1024, onToolCall } = args;
    const { session, lastUserText, dispose } = await this.createSession(
      model,
      args.messages
    );

    this.recordRequestPayload({ model, messages: args.messages, maxTokens });

    const { defineChatSessionFunction } = await loadNodeLlamaCpp();
    const pendingCalls: ToolCall[] = [];
    const stopSignal = new AbortController();
    const functions = this.buildToolFunctions(
      tools,
      onToolCall,
      defineChatSessionFunction,
      pendingCalls,
      () => stopSignal.abort()
    );
    const signal = args.signal
      ? AbortSignal.any([args.signal, stopSignal.signal])
      : stopSignal.signal;

    const queue: string[] = [];
    let resolveNext: (() => void) | null = null;
    let done = false;
    let error: unknown = null;

    const promptPromise = session
      .prompt(lastUserText, {
        maxTokens,
        temperature: args.temperature,
        topP: args.topP,
        signal,
        functions,
        stopOnAbortSignal: true,
        onTextChunk: (chunk: string) => {
          queue.push(chunk);
          resolveNext?.();
        }
      })
      .catch((e: unknown) => {
        // `stopOnAbortSignal` only suppresses the abort when the model had
        // already produced text (node-llama-cpp's `res.length === 0` guard), so
        // a call emitted with no preceding prose still rejects. That abort is
        // ours and means success: the call was captured.
        if (stopSignal.signal.aborted && !args.signal?.aborted) return "";
        error = e;
        return "";
      })
      .finally(() => {
        done = true;
        resolveNext?.();
      });

    try {
      while (!done || queue.length > 0) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
          resolveNext = null;
          continue;
        }
        const content = queue.shift()!;
        const out: Chunk = { type: "chunk", content, done: false };
        yield out;
      }

      await promptPromise;
      if (error)
        throw error instanceof Error ? error : new Error(String(error));

      const doneChunk: Chunk = { type: "chunk", content: "", done: true };
      yield doneChunk;

      for (const tc of pendingCalls) {
        yield tc;
      }
    } finally {
      await dispose();
    }
  }

  async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    onToolCall?: (
      name: string,
      args: Record<string, unknown>
    ) => Promise<string>;
    signal?: AbortSignal;
  }): Promise<Message> {
    let content = "";
    const toolCalls: ToolCall[] = [];
    for await (const item of this.generateMessages(args)) {
      if ("args" in item) toolCalls.push(item);
      else if ("content" in item && typeof item.content === "string")
        content += item.content;
    }
    return {
      role: "assistant",
      content,
      toolCalls: toolCalls.length ? toolCalls : null
    };
  }

  async generateEmbedding(args: {
    text: string | string[];
    model: string;
    dimensions?: number;
  }): Promise<number[][]> {
    const loaded = await this.getOrLoadModel(args.model);
    const ctx = await loaded.createEmbeddingContext();
    try {
      const texts = Array.isArray(args.text) ? args.text : [args.text];
      const out: number[][] = [];
      for (const text of texts) {
        const embedding = await ctx.getEmbeddingFor(text);
        out.push([...embedding.vector]);
      }
      return out;
    } finally {
      await ctx.dispose();
    }
  }

  async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const files = await this.scanGgufFiles();
    return files.map((id) => ({ id, name: id, provider: "node_llama_cpp" }));
  }

  async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    const files = await this.scanGgufFiles();
    return files.map((id) => ({ id, name: id, provider: "node_llama_cpp" }));
  }

  /** List GGUF filenames (relative to the models directory) available locally. */
  private async scanGgufFiles(): Promise<string[]> {
    const fsp = await importNodeBuiltin<typeof import("node:fs/promises")>(
      "node:fs/promises"
    );
    const path = await importNodeBuiltin<typeof import("node:path")>(
      "node:path"
    );
    if (!fsp || !path) return [];
    const dir = await this.resolveModelsDir();
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .filter(
        (e) => e.isFile() && e.name.toLowerCase().endsWith(".gguf")
      )
      .map((e) => e.name)
      .sort();
  }

  isContextLengthError(error: unknown): boolean {
    const msg = String(error).toLowerCase();
    return (
      msg.includes("context length") ||
      msg.includes("context window") ||
      msg.includes("context size") ||
      msg.includes("token limit") ||
      msg.includes("out of memory")
    );
  }
}
