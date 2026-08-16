/**
 * The mobile frontend-tool registry.
 *
 * A slim port of web's `FrontendToolRegistry`. Two deliberate differences:
 *
 * - **Parameters are plain JSON Schema.** Web declares them with zod and
 *   converts; mobile has no zod dependency, and the server only ever sees the
 *   converted JSON Schema anyway, so we write that directly.
 * - **No workflow runtime state.** Web's `FrontendToolContext` carries the
 *   whole graph-editor state. Mobile tools act on documents through the agent
 *   bridge, so the context only needs an abort signal.
 *
 * The wire contract is unchanged, which is what matters: the client pushes
 * `client_tools_manifest` on connect, the server sends `tool_call`, the client
 * answers `tool_result`.
 */

/** JSON Schema for a tool's arguments. Object schemas only, as providers require. */
export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface MobileToolContext {
  abortSignal: AbortSignal;
}

/**
 * What a `ui_*` tool answers with: a primitive or an object, which
 * `executeToolCall` sends back to the agent as the tool result payload.
 */
export type MobileToolResult =
  | string
  | number
  | boolean
  | null
  | undefined
  | object;

export interface MobileToolDefinition<Args = Record<string, unknown>> {
  name: `ui_${string}`;
  description: string;
  parameters: ToolParameterSchema;
  execute: (args: Args, ctx: MobileToolContext) => Promise<MobileToolResult>;
}

/** One manifest entry, exactly as the server's `clientToolsManifest` reads it. */
export interface ToolManifestEntry {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

/** `never` args: the one `execute` signature every tool is assignable to. */
const registry = new Map<string, MobileToolDefinition<never>>();
const active = new Map<string, AbortController>();

export const MobileToolRegistry = {
  register<Args>(tool: MobileToolDefinition<Args>): () => boolean {
    registry.set(tool.name, tool);
    return () => registry.delete(tool.name);
  },

  getManifest(): ToolManifestEntry[] {
    return [...registry.values()].map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    }));
  },

  has(name: string): boolean {
    return registry.has(name);
  },

  names(): string[] {
    return [...registry.keys()];
  },

  async call(
    name: string,
    args: unknown,
    toolCallId: string
  ): Promise<MobileToolResult> {
    const tool = registry.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    const controller = new AbortController();
    active.set(toolCallId, controller);
    try {
      return await tool.execute(args as never, {
        abortSignal: controller.signal,
      });
    } finally {
      active.delete(toolCallId);
    }
  },

  /** Abort every in-flight call — used when the user stops generation. */
  abortAll(): void {
    for (const controller of active.values()) {
      controller.abort();
    }
    active.clear();
  },

  /** Test seam. */
  reset(): void {
    registry.clear();
    active.clear();
  },
};
