/**
 * Generic stub for all @nodetool-ai/* workspace packages that have not been built,
 * plus direct CLI dependencies that are not installed at the root level.
 * Tests override the specific exports they need via vi.mock().
 */

// config
export const getDefaultDbPath = (): string => ":memory:";
export const getDefaultAssetsPath = (): string => "/tmp/nodetool-assets-stub";

// deploy
export class AdminHTTPClient {
  constructor(_opts?: unknown) {}
  async listWorkflows() {
    return { workflows: [] };
  }
  async deleteWorkflow(_id?: string) {
    return {};
  }
  async runWorkflow(_id?: string, _params?: unknown) {
    return {};
  }
}
export class APIUserManager {
  constructor(_u?: string, _t?: string) {}
  async listUsers() {
    return [];
  }
  async addUser(_u?: string, _r?: string) {
    return { username: "u", user_id: "1", role: "user", token: "t" };
  }
  async resetToken(_u?: string) {
    return { username: "u", user_id: "1", role: "user", token: "t" };
  }
  async removeUser(_u?: string) {
    return { message: "ok" };
  }
}
export class DeploymentManager {
  constructor(_c?: unknown, _s?: unknown, _f?: unknown) {}
  async listDeployments() {
    return [];
  }
  async plan(_n?: string) {
    return { ok: true };
  }
  async apply(_n?: string, _o?: unknown) {
    return { status: "success" };
  }
  async status(_n?: string) {
    return { status: "unknown" };
  }
  async logs(_n?: string, _o?: unknown) {
    return "";
  }
  async destroy(_n?: string, _o?: unknown) {
    return { status: "success" };
  }
}
export class StateManager {
  constructor(_p?: string) {}
}
export class WorkflowSyncer {
  constructor(_c?: unknown, _d?: unknown) {}
  async syncWorkflow(_id?: string) {
    return true;
  }
}
export class DockerDeployer {
  constructor(_n?: string, _d?: unknown, _s?: unknown) {}
}
const schemaStub = {
  parse: (v: unknown) => v
};
export const DockerDeploymentSchema = schemaStub;
export const configureDocker = (_n: string, _p: unknown) => ({ type: "docker" });
export const dockerDeploymentGetServerUrl = (_d?: unknown) => "http://localhost:8000";
export const getDeploymentConfigPath = (): string => "/tmp/deployment.yaml";
export async function initDeploymentConfig() {
  return { version: "2.0", defaults: {}, deployments: {} };
}
export async function loadDeploymentConfig() {
  return { version: "2.0", defaults: {}, deployments: {} };
}
export async function saveDeploymentConfig(_c?: unknown) {}

// vectorstore
export class CollectionNotFoundError extends Error {
  constructor(name: string) {
    super(`Vector collection '${name}' not found`);
    this.name = "CollectionNotFoundError";
  }
}
export function getDefaultVectorProvider() {
  return {
    name: "stub",
    async getCollection({ name }: { name: string }) {
      throw new CollectionNotFoundError(name);
    },
    async listCollections() {
      return [];
    },
    async createCollection() {
      throw new Error("stub provider");
    },
    async getOrCreateCollection() {
      throw new Error("stub provider");
    },
    async deleteCollection() {
      throw new Error("stub provider");
    },
    close() {}
  };
}

// runtime storage adapter
export class FileStorageAdapter {
  constructor(_root?: string) {}
  async retrieve(_uri?: string): Promise<Uint8Array | null> {
    return null;
  }
}

// providers
export class BaseProvider {
  constructor(public id: string) {}
}
export class AnthropicProvider extends BaseProvider {
  constructor(_cfg?: unknown) {
    super("anthropic");
  }
}
export class OpenAIProvider extends BaseProvider {
  constructor(_cfg?: unknown) {
    super("openai");
  }
}
export class OllamaProvider extends BaseProvider {
  constructor(_cfg?: unknown) {
    super("ollama");
  }
}
export class GeminiProvider extends BaseProvider {
  constructor(_cfg?: unknown) {
    super("gemini");
  }
}
export class MistralProvider extends BaseProvider {
  constructor(_cfg?: unknown) {
    super("mistral");
  }
}
export class GroqProvider extends BaseProvider {
  constructor(_cfg?: unknown) {
    super("groq");
  }
}

// provider registry — mirrors the real runtime registry so the CLI's
// registry-driven provider factory (createProvider / availableProviders /
// buildConfiguredProviders) works against the stub. Tests that need different
// behaviour override these via vi.mock("@nodetool-ai/runtime").
const STUB_PROVIDER_SECRET_KEYS: Record<string, string | null> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  xai: "XAI_API_KEY",
  groq: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  moonshot: "KIMI_API_KEY",
  minimax: "MINIMAX_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  alibaba: "DASHSCOPE_API_KEY",
  together: "TOGETHER_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  huggingface: "HF_TOKEN",
  replicate: "REPLICATE_API_TOKEN",
  kie: "KIE_API_KEY",
  aki: "AKI_API_KEY",
  ollama: null,
  lmstudio: null
};
export const getProviderSecretKey = (id: string): string | null =>
  STUB_PROVIDER_SECRET_KEYS[id] ?? null;
export const listRegisteredProviderIds = (): string[] =>
  Object.keys(STUB_PROVIDER_SECRET_KEYS);
export const isProviderConfigured = async (id: string): Promise<boolean> => {
  const key = STUB_PROVIDER_SECRET_KEYS[id];
  return key == null ? true : Boolean(process.env[key]);
};
export const getProvider = async (id: string): Promise<BaseProvider> =>
  new BaseProvider(id);

// runtime helpers
export class ProcessingContext {
  private _modelInterfaces: Record<string, unknown> = {};
  private readonly _variables = new Map<string, unknown>();
  private _secretResolver:
    | ((key: string, userId: string) => Promise<string | null> | string | null)
    | null;
  readonly userId: string;
  constructor(opts?: {
    userId?: string;
    secretResolver?: (
      key: string,
      userId: string
    ) => Promise<string | null> | string | null;
  }) {
    this.userId = opts?.userId ?? "1";
    this._secretResolver = opts?.secretResolver ?? null;
  }
  setModelInterfaces(interfaces: Record<string, unknown>): void {
    this._modelInterfaces = interfaces;
  }
  hasModelInterface(name: string): boolean {
    return typeof this._modelInterfaces[name] === "function";
  }
  async createAsset(args: Record<string, unknown>): Promise<unknown> {
    const fn = this._modelInterfaces["createAsset"];
    if (typeof fn !== "function") throw new Error("createAsset is not wired");
    return (fn as (a: Record<string, unknown>) => Promise<unknown>)({
      userId: this.userId,
      ...args
    });
  }
  async getSecret(key: string): Promise<string | null> {
    if (!this._secretResolver) return null;
    return (await this._secretResolver(key, this.userId)) ?? null;
  }
  /** The variable bag hosts publish the run's gate and budget on. */
  set(key: string, value: unknown): void {
    this._variables.set(key, value);
  }
  get<T = unknown>(key: string, defaultValue?: T): T | undefined {
    return this._variables.has(key)
      ? (this._variables.get(key) as T)
      : defaultValue;
  }
}
/** Mirrors the real CORE_TOOL_NAMES so the CodeAct split behaves in tests. */
export const CORE_TOOL_NAMES: ReadonlySet<string> = new Set([
  "read_file",
  "write_file",
  "edit_file",
  "list_directory",
  "glob",
  "grep",
  "web_search",
  "browser",
  "http_request",
  "download_file",
  "todo_write",
  "run_subtask"
]);
/** Mirrors DISCOVERY_TOOL_NAMES: providers, models, node types. */
export const DISCOVERY_TOOL_NAMES: ReadonlySet<string> = new Set([
  "find_model",
  "list_models",
  "list_provider_models",
  "search_nodes",
  "get_node_info",
  "list_nodes"
]);
/** What the CodeAct wiring actually offers top level. */
export const DIRECT_TOOL_NAMES: ReadonlySet<string> = new Set([
  ...CORE_TOOL_NAMES,
  ...DISCOVERY_TOOL_NAMES
]);
export async function initTelemetry() {}
export async function processChat(_opts?: unknown) {}

// agents
export class Agent {
  constructor(public opts: unknown) {}
  async *execute(_ctx?: unknown): AsyncGenerator<never> {}
}

// security
export const getSecret = async (
  _key?: string,
  _userId?: string
): Promise<string | null> => null;

// models
export class SQLiteAdapterFactory {
  constructor(_path?: string) {}
  getAdapter(_schema?: string) {
    return null;
  }
}
export const setGlobalAdapterResolver = (_fn?: unknown) => {};
export const initDb = (_path?: string) => {};
// models — the settings row a budget/provider lookup reads. No database in a
// unit test, so the lookup falls through to the environment and the defaults.
export class Setting {
  static async find(_userId?: string, _key?: string): Promise<null> {
    return null;
  }
}
export class Secret {
  static async createTable() {}
  static async listForUser(_userId?: string, _limit?: number) {
    return [[], 0];
  }
  static async upsert(_data?: unknown) {}
  static async get(_key?: string, _userId?: string) {
    return null;
  }
}
export class Workflow {
  static async get(_id?: string) {
    return null;
  }
  static async find(_userId?: string, _id?: string) {
    return null;
  }
}
export class Asset {
  static async find(_userId?: string, _id?: string) {
    return null;
  }
}

// kernel
export class WorkflowRunner {
  constructor(_jobId?: string, _opts?: unknown) {}
  async run(_req?: unknown, _graph?: unknown) {
    return { status: "completed", outputs: {} };
  }
}

// node-sdk
export class NodeRegistry {
  private nodes = new Map<string, unknown>();
  has(type: string) {
    return this.nodes.has(type);
  }
  resolve(_node: unknown) {
    return null;
  }
  register(type: string, node: unknown) {
    this.nodes.set(type, node);
  }
}

// base-nodes / fal-nodes / replicate-nodes / elevenlabs-nodes / transformers-js-nodes
export const registerBaseNodes = (_reg?: unknown) => {};
export const registerElevenLabsNodes = (_reg?: unknown) => {};
export const registerMinimaxNodes = (_reg?: unknown) => {};
export const registerTransformersJsNodes = (_reg?: unknown) => {};
export const registerFalNodes = (_reg?: unknown) => {};
export const registerReplicateNodes = (_reg?: unknown) => {};
export const registerReveNodes = (_reg?: unknown) => {};
export const registerHuggingFaceNodes = (_reg?: unknown) => {};

// dsl
export const workflowToDsl = (_graph?: unknown, _opts?: unknown) =>
  "// generated DSL";

/**
 * Minimal stub for @nodetool-ai/dsl run().
 * Evaluates constant nodes and propagates values through edges to output nodes.
 */
export async function run(wf: {
  nodes: any[];
  edges: any[];
}): Promise<Record<string, unknown>> {
  // nodeOutputs maps nodeId -> { slotName: value }
  const nodeOutputs = new Map<string, Record<string, unknown>>();

  // First pass: collect constant node values (they have no upstream edges)
  for (const node of wf.nodes) {
    if (node.type?.startsWith("nodetool.constant.")) {
      nodeOutputs.set(node.id, { output: node.data?.value });
    }
  }

  // Propagate values through edges (simple single-pass for acyclic graphs)
  for (const node of wf.nodes) {
    if (nodeOutputs.has(node.id)) continue;
    const incoming: Record<string, unknown> = { ...node.data };
    for (const edge of wf.edges) {
      if (edge.target === node.id) {
        const src = nodeOutputs.get(edge.source);
        if (src) {
          incoming[edge.targetHandle] = src[edge.sourceHandle];
        }
      }
    }
    // For output nodes, expose incoming value as "output"
    if (node.type?.startsWith("nodetool.output.")) {
      nodeOutputs.set(node.id, { output: incoming.value });
    } else {
      nodeOutputs.set(node.id, incoming);
    }
  }

  // Collect results from output nodes
  const results: Record<string, unknown> = {};
  for (const node of wf.nodes) {
    if (node.type?.startsWith("nodetool.output.")) {
      const vals = nodeOutputs.get(node.id);
      if (vals) {
        results[node.id] = vals.output;
      }
    }
  }
  return results;
}

// chat
export type Message = { role: string; content: string };
export type ProviderStreamItem = { type: string };
export type ProviderTool = { name: string };
export type Chunk = { type: "chunk"; content: string };

// protocol — the named type predicates `src/predicates.ts` re-exports. These
// are pure and have no dependencies, so the stub carries the real behaviour:
// a stubbed-away `isString` silently returns undefined and every narrowing
// call site takes the wrong branch.
export function isString(value: unknown): value is string {
  return typeof value === "string";
}
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
export function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
export function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}
export function isObjectLike(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function isCallable(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === "function";
}

// marked (used by markdown.ts — not available at repo root)
export const marked = Object.assign((_text: string) => _text, {
  use: (_ext: unknown) => {}
});

// marked-terminal (used by markdown.ts — not available at repo root)
export const markedTerminal = (_opts?: unknown) => ({ extensions: [] });
export default markedTerminal;

// js-yaml — stubbed because it's not installed at the workspace root
export const load = (_raw: string, _opts?: unknown) => ({});
export const dump = (v: unknown, _opts?: unknown) =>
  JSON.stringify(v, null, 2) + "\n";
export const JSON_SCHEMA = {};

// @inquirer/prompts — stubbed for non-interactive tests
export const input = async (_q: unknown) => "";
export const password = async (_q: unknown) => "";
export const select = async (_q: unknown) => null;

/** `@nodetool-ai/websocket/assets` — the chat context's asset persistence. */
export async function createAssetModelInterface(args: {
  name: string;
}): Promise<{ id: string; name: string }> {
  return { id: "stub-asset", name: args.name };
}

/** The tool name a code action is admitted under; the ladder keys on it. */
export const EXECUTE_CODE_TOOL_NAME = "execute_code";
