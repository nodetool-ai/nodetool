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
  async dbGet(_table?: string, _key?: string) {
    return {};
  }
  async dbSave(_table?: string, _data?: unknown) {
    return {};
  }
  async dbDelete(_table?: string, _key?: string) {}
  async createCollection(_n?: string, _m?: string) {
    return {};
  }
  async addToCollection(
    _n?: string,
    _d?: unknown,
    _i?: unknown,
    _m?: unknown,
    _e?: unknown
  ) {
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
export class RunPodDeployer {
  constructor(_n?: string, _d?: unknown, _s?: unknown) {}
}
export class GCPDeployer {
  constructor(_n?: string, _d?: unknown, _s?: unknown) {}
}
export class FlyDeployer {
  constructor(_n?: string, _d?: unknown, _s?: unknown) {}
}
export class RailwayDeployer {
  constructor(_n?: string, _d?: unknown, _s?: unknown) {}
}
export class HuggingFaceDeployer {
  constructor(_n?: string, _d?: unknown, _s?: unknown) {}
}
const schemaStub = {
  parse: (v: unknown) => v
};
export const DockerDeploymentSchema = schemaStub;
export const FlyDeploymentSchema = schemaStub;
export const HuggingFaceDeploymentSchema = schemaStub;
export const RailwayDeploymentSchema = schemaStub;
export const RunPodDeploymentSchema = schemaStub;
export const configureDocker = (_n: string, _p: unknown) => ({ type: "docker" });
export const configureGCP = (_n: string, _p: unknown) => ({ type: "gcp" });
export const configureRunPod = (_n: string, _p: unknown) => ({ type: "runpod" });
export const dockerDeploymentGetServerUrl = (_d?: unknown) => "http://localhost:8000";
export const runPodDeploymentGetServerUrl = (_d?: unknown) => undefined;
export const gcpDeploymentGetServerUrl = (_d?: unknown) => undefined;
export const getDeploymentConfigPath = (): string => "/tmp/deployment.yaml";
export async function initDeploymentConfig() {
  return { version: "2.0", defaults: {}, deployments: {} };
}
export async function loadDeploymentConfig() {
  return { version: "2.0", defaults: {}, deployments: {} };
}
export async function saveDeploymentConfig(_c?: unknown) {}
export const GPUType = { ADA_24: "ADA_24" };
export const ComputeType = { CPU: "CPU", GPU: "GPU" };
export const CPUFlavor = { CPU_3C: "cpu3c" };
export const DataCenter = { US_TEXAS_1: "US-TX-1" };

// vectorstore
export async function getCollection(_name?: string) {
  return null;
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

// runtime helpers
export class ProcessingContext {
  constructor(_opts?: unknown) {}
}
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
export const registerTransformersJsNodes = (_reg?: unknown) => {};
export const registerFalNodes = (_reg?: unknown) => {};
export const registerReplicateNodes = (_reg?: unknown) => {};

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

// protocol
export type {}; // nothing needed

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
