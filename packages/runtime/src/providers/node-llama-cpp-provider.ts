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
import { parseEmulatedToolCalls } from "./llama-tool-emulation.js";

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

type ChatHistoryItem =
  | { type: "system"; text: string }
  | { type: "user"; text: string }
  | { type: "model"; response: string[] };

interface ChatSessionOptions {
  contextSequence: NodeLlamaContextSequence;
  systemPrompt?: string;
}

interface PromptOptions {
  onTextChunk?: (chunk: string) => void;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  signal?: AbortSignal;
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
}> | null = null;

async function loadNodeLlamaCpp(): Promise<{
  getLlama: NodeLlamaModule["getLlama"];
  LlamaChatSession: ChatSessionCtor;
}> {
  if (!_modulePromise) {
    _modulePromise = (async () => {
      try {
        const mod = await importOptionalModule<{
          getLlama: NodeLlamaModule["getLlama"];
          LlamaChatSession: ChatSessionCtor;
        }>("node-llama-cpp");
        return { getLlama: mod.getLlama, LlamaChatSession: mod.LlamaChatSession };
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
 * Tool calling reuses the same emulated-parsing path as the remote provider —
 * grammar-constrained native function calling is a follow-up.
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
    // Tool calls flow through emulated parsing, matching LlamaProvider.
    return false;
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
   * the final user turn to prompt with. */
  private buildChat(messages: Message[]): {
    systemPrompt: string;
    history: ChatHistoryItem[];
    lastUserText: string;
  } {
    const systemParts: string[] = [];
    const turns: Message[] = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        systemParts.push(asText(msg.content));
      } else if (msg.role === "tool") {
        turns.push({
          role: "user",
          content: `Tool result:\n${asText(msg.content)}`
        });
      } else {
        turns.push(msg);
      }
    }

    let lastUserText = "";
    if (turns.length > 0 && turns[turns.length - 1].role === "user") {
      lastUserText = asText(turns.pop()!.content);
    }

    const history: ChatHistoryItem[] = [];
    for (const msg of turns) {
      if (msg.role === "assistant") {
        history.push({ type: "model", response: [asText(msg.content)] });
      } else {
        history.push({ type: "user", text: asText(msg.content) });
      }
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

  async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    signal?: AbortSignal;
  }): AsyncGenerator<ProviderStreamItem> {
    const { model, tools = [], maxTokens = 1024 } = args;
    const { session, lastUserText, dispose } = await this.createSession(
      model,
      args.messages
    );

    this.recordRequestPayload({ model, messages: args.messages, maxTokens });

    const queue: string[] = [];
    let resolveNext: (() => void) | null = null;
    let done = false;
    let error: unknown = null;

    const promptPromise = session
      .prompt(lastUserText, {
        maxTokens,
        temperature: args.temperature,
        topP: args.topP,
        signal: args.signal,
        onTextChunk: (chunk: string) => {
          queue.push(chunk);
          resolveNext?.();
        }
      })
      .catch((e: unknown) => {
        error = e;
        return "";
      })
      .finally(() => {
        done = true;
        resolveNext?.();
      });

    let accumulated = "";
    while (!done || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
        resolveNext = null;
        continue;
      }
      const content = queue.shift()!;
      accumulated += content;
      const out: Chunk = { type: "chunk", content, done: false };
      yield out;
    }

    await promptPromise;
    if (error) throw error instanceof Error ? error : new Error(String(error));

    const doneChunk: Chunk = { type: "chunk", content: "", done: true };
    yield doneChunk;

    if (tools.length > 0) {
      const parsed = parseEmulatedToolCalls(accumulated, tools);
      for (const tc of parsed.toolCalls) {
        yield tc;
      }
    }

    await dispose();
  }

  async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    signal?: AbortSignal;
  }): Promise<Message> {
    const { model, tools = [], maxTokens = 1024 } = args;
    const { session, lastUserText, dispose } = await this.createSession(
      model,
      args.messages
    );

    this.recordRequestPayload({ model, messages: args.messages, maxTokens });

    try {
      const content = await session.prompt(lastUserText, {
        maxTokens,
        temperature: args.temperature,
        topP: args.topP,
        signal: args.signal
      });

      let toolCalls: ToolCall[] = [];
      if (tools.length > 0) {
        toolCalls = parseEmulatedToolCalls(content, tools).toolCalls;
      }
      return { role: "assistant", content, toolCalls };
    } finally {
      await dispose();
    }
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
