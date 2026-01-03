/**
 * Browser Tool Registry for Chrome Extension.
 * 
 * Provides a registry of client-side browser tools that can be called by AI agents
 * via the tool bridge. These tools use Chrome Extension APIs to interact with
 * the browser environment.
 */

export type JsonSchema = Record<string, unknown>;

export interface BrowserToolDefinition {
  name: `browser_${string}`;
  description: string;
  parameters: JsonSchema;
  /**
   * Excludes the tool from the LLM-facing manifest (token savings) while still
   * allowing direct calls by name for backwards compatibility.
   */
  hidden?: boolean;
  requireUserConsent?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (args: any, ctx: BrowserToolContext) => Promise<any>;
}

export interface BrowserToolContext {
  abortSignal: AbortSignal;
}

type ActiveCall = { controller: AbortController };

const registry = new Map<string, BrowserToolDefinition>();
const active = new Map<string, ActiveCall>();

export const BrowserToolRegistry = {
  register(tool: BrowserToolDefinition) {
    registry.set(tool.name, tool);
    return () => registry.delete(tool.name);
  },

  getManifest() {
    return Array.from(registry.values())
      .filter((tool) => !tool.hidden)
      .map(({ name, description, parameters }) => ({
        name,
        description,
        parameters
      }));
  },

  has(name: string) {
    return registry.has(name);
  },

  get(name: string) {
    return registry.get(name);
  },

  requiresConsent(name: string): boolean {
    const tool = registry.get(name);
    return tool?.requireUserConsent === true;
  },

  async call(
    name: string,
    args: unknown,
    toolCallId: string,
    ctx: Omit<BrowserToolContext, "abortSignal">
  ) {
    const tool = registry.get(name);
    if (!tool) {
      throw new Error(`Unknown browser tool: ${name}`);
    }
    const controller = new AbortController();
    active.set(toolCallId, { controller });
    try {
      return await tool.execute(args, {
        abortSignal: controller.signal,
        ...ctx
      });
    } finally {
      active.delete(toolCallId);
    }
  },

  abortAll() {
    for (const { controller } of active.values()) {
      controller.abort();
    }
    active.clear();
  },

  getAll() {
    return Array.from(registry.values());
  }
};
