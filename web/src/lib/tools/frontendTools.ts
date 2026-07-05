import {
  isZodSchema,
  parseWithTypeCoercion,
  zodToJsonSchema,
  type ZodOrJsonSchema
} from "@nodetool-ai/runtime/zod-schema";
import { NodeMetadata, Workflow, WorkflowList } from "../../stores/ApiTypes";
import { NodeStore } from "../../stores/NodeStore";

export interface FrontendToolDefinition<Result = unknown, Args = any> {
  name: `ui_${string}`;
  description: string;
  parameters: ZodOrJsonSchema;
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
  searchTemplates: (query: string) => Promise<WorkflowList>;
  copy: (originalWorkflow: Workflow) => Promise<Workflow>;
  getOpenWorkflowIds?: () => string[];
  openWorkflow?: (workflowId: string) => Promise<void>;
  runWorkflow?: (
    workflowId: string,
    params?: Record<string, unknown>
  ) => Promise<void>;
  switchTab?: (tabIndex: number) => Promise<string>;
  copyToClipboard?: (text: string) => Promise<void>;
  pasteFromClipboard?: () => Promise<string>;
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
        parameters: isZodSchema(parameters)
          ? zodToJsonSchema(parameters)
          : parameters
      }));
  },
  has(name: string) {
    return registry.has(name);
  },
  get(name: string) {
    return registry.get(name);
  },
  async call(
    name: string,
    args: unknown,
    toolCallId: string,
    ctx: Omit<FrontendToolContext, "abortSignal">
  ) {
    const tool = registry.get(name);
    if (!tool) {throw new Error(`Unknown tool: ${name}`);}
    const controller = new AbortController();
    active.set(toolCallId, { controller });
    try {
      // Validate args using Zod if parameters is a Zod schema
      const validatedArgs = isZodSchema(tool.parameters)
        ? parseWithTypeCoercion(tool.parameters, args)
        : args;

      const result = await tool.execute(validatedArgs, {
        abortSignal: controller.signal,
        getState: ctx.getState
      });

      return result;
    } finally {
      active.delete(toolCallId);
    }
  },
  abortAll() {
    for (const { controller } of active.values()) {controller.abort();}
    active.clear();
  }
};
