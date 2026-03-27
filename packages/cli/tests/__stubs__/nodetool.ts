/**
 * Generic stub for all @nodetool/* workspace packages that have not been built,
 * plus direct CLI dependencies that are not installed at the root level.
 * Tests override the specific exports they need via vi.mock().
 */

// providers
export class BaseProvider { constructor(public id: string) {} }
export class AnthropicProvider extends BaseProvider { constructor(_cfg?: unknown) { super("anthropic"); } }
export class OpenAIProvider   extends BaseProvider { constructor(_cfg?: unknown) { super("openai");    } }
export class OllamaProvider   extends BaseProvider { constructor(_cfg?: unknown) { super("ollama");    } }
export class GeminiProvider   extends BaseProvider { constructor(_cfg?: unknown) { super("gemini");    } }
export class MistralProvider  extends BaseProvider { constructor(_cfg?: unknown) { super("mistral");   } }
export class GroqProvider     extends BaseProvider { constructor(_cfg?: unknown) { super("groq");      } }

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
export const getSecret = async (_key?: string, _userId?: string): Promise<string | null> => null;

// models
export class SQLiteAdapterFactory { constructor(_path?: string) {} getAdapter(_schema?: string) { return null; } }
export const setGlobalAdapterResolver = (_fn?: unknown) => {};
export class Secret {
  static async createTable() {}
  static async listForUser(_userId?: string, _limit?: number) { return [[], 0]; }
  static async upsert(_data?: unknown) {}
  static async get(_key?: string, _userId?: string) { return null; }
}
export class Workflow {
  static async get(_id?: string) { return null; }
}

// kernel
export class WorkflowRunner {
  constructor(_jobId?: string, _opts?: unknown) {}
  async run(_req?: unknown, _graph?: unknown) { return { status: "completed", outputs: {} }; }
}

// node-sdk
export class NodeRegistry {
  private nodes = new Map<string, unknown>();
  has(type: string) { return this.nodes.has(type); }
  resolve(_node: unknown) { return null; }
  register(type: string, node: unknown) { this.nodes.set(type, node); }
}

// base-nodes / fal-nodes / replicate-nodes / elevenlabs-nodes
export const registerBaseNodes = (_reg?: unknown) => {};
export const registerElevenLabsNodes = (_reg?: unknown) => {};
export const registerFalNodes  = (_reg?: unknown) => {};
export const registerReplicateNodes = (_reg?: unknown) => {};

// dsl
export const workflowToDsl = (_graph?: unknown, _opts?: unknown) => "// generated DSL";

// chat
export type Message = { role: string; content: string };
export type ProviderStreamItem = { type: string };
export type ProviderTool = { name: string };
export type Chunk = { type: "chunk"; content: string };

// protocol
export type {} // nothing needed

// marked (used by markdown.ts — not available at repo root)
export const marked = Object.assign((_text: string) => _text, { use: (_ext: unknown) => {} });

// marked-terminal (used by markdown.ts — not available at repo root)
export const markedTerminal = (_opts?: unknown) => ({ extensions: [] });
export default markedTerminal;
