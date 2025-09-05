import { NodeStoreState } from "../../stores/NodeStore";

export type JsonSchema = Record<string, any>;

export interface FrontendToolDefinition<Args = any, Result = any> {
  name: `ui_${string}`;
  description: string;
  parameters: JsonSchema;
  requireUserConsent?: boolean;
  execute: (args: Args, ctx: FrontendToolContext) => Promise<Result>;
}

export interface FrontendToolContext {
  abortSignal: AbortSignal;
  getState: () => {
    nodeStore: NodeStoreState;
  };
}

type ActiveCall = { controller: AbortController };

const registry = new Map<string, FrontendToolDefinition>();
const active = new Map<string, ActiveCall>();

export const FrontendToolRegistry = {
  register(tool: FrontendToolDefinition) {
    registry.set(tool.name, tool);
    return () => registry.delete(tool.name);
  },
  getManifest() {
    return Array.from(registry.values()).map(
      ({ name, description, parameters }) => ({ name, description, parameters })
    );
  },
  has(name: string) {
    return registry.has(name);
  },
  async call(
    name: string,
    args: any,
    toolCallId: string,
    ctx: Omit<FrontendToolContext, "abortSignal">
  ) {
    const tool = registry.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    const controller = new AbortController();
    active.set(toolCallId, { controller });
    try {
      return await tool.execute(args, {
        abortSignal: controller.signal,
        getState: ctx.getState
      });
    } finally {
      active.delete(toolCallId);
    }
  },
  abortAll() {
    for (const { controller } of active.values()) controller.abort();
    active.clear();
  }
};
