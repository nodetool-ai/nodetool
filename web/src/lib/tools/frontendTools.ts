import { NodeMetadata, Workflow } from "../../stores/ApiTypes";
import { NodeStore } from "../../stores/NodeStore";

export type JsonSchema = Record<string, any>;

export interface FrontendToolDefinition<Args = any, Result = any> {
  name: `ui_${string}`;
  description: string;
  parameters: JsonSchema;
  /**
   * Excludes the tool from the LLM-facing manifest (token savings) while still
   * allowing direct calls by name for backwards compatibility.
   */
  hidden?: boolean;
  requireUserConsent?: boolean;
  execute: (args: Args, ctx: FrontendToolContext) => Promise<Result>;
}

export interface FrontendToolState {
  nodeMetadata: Record<string, NodeMetadata>;
  currentWorkflowId: string | null;
  getWorkflow: (workflowId: string) => Workflow | undefined;
  addWorkflow: (workflow: Workflow) => void;
  removeWorkflow: (workflowId: string) => void;
  getNodeStore: (workflowId: string) => NodeStore | undefined;
  updateWorkflow: (workflow: Workflow) => void;
  saveWorkflow: (workflow: Workflow) => Promise<void>;
  getCurrentWorkflow: () => Workflow | undefined;
  setCurrentWorkflowId: (workflowId: string) => void;
  fetchWorkflow: (workflowId: string) => Promise<void>;
  newWorkflow: () => Workflow;
  createNew: () => Promise<Workflow>;
  searchTemplates: (query: string) => Promise<any>;
  copy: (originalWorkflow: Workflow) => Promise<Workflow>;
}

export interface FrontendToolContext {
  abortSignal: AbortSignal;
  getState: () => FrontendToolState;
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
  async call(
    name: string,
    args: any,
    toolCallId: string,
    ctx: Omit<FrontendToolContext, "abortSignal">
  ) {
    const tool = registry.get(name);
    if (!tool) {throw new Error(`Unknown tool: ${name}`);}
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
    for (const { controller } of active.values()) {controller.abort();}
    active.clear();
  },
  clearRegistry() {
    registry.clear();
    active.clear();
  }
};
