import type { ZodType, output as ZodOutput } from "zod";
import {
  isZodSchema,
  parseWithTypeCoercion,
  zodToJsonSchema,
  type JsonSchema,
  type ZodOrJsonSchema
} from "@nodetool-ai/protocol/zod-schema";
import { NodeMetadata, Workflow, WorkflowList } from "../../stores/ApiTypes";
import { NodeStore } from "../../stores/NodeStore";

/** A tool's parsed args, or `unknown` when it declares a raw JSON schema. */
type InferToolArgs<Schema extends ZodOrJsonSchema> =
  Schema extends ZodType ? ZodOutput<Schema> : unknown;

export interface FrontendToolDefinition<
  Schema extends ZodOrJsonSchema = ZodOrJsonSchema,
  Result = unknown
> {
  name: `ui_${string}`;
  description: string;
  parameters: Schema;
  requireUserConsent?: boolean;
  execute: (
    args: InferToolArgs<Schema>,
    ctx: FrontendToolContext
  ) => Promise<Result>;
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

/**
 * A tool with its schema erased. `never` args is the one `execute` signature
 * every tool is assignable to; `call` re-widens after validating against the
 * tool's own `parameters`.
 */
type RegisteredTool = Omit<FrontendToolDefinition, "parameters" | "execute"> & {
  parameters: ZodOrJsonSchema;
  execute: (args: never, ctx: FrontendToolContext) => Promise<unknown>;
};

interface FrontendToolManifestEntry {
  name: string;
  description: string;
  parameters: JsonSchema;
}

const registry = new Map<string, RegisteredTool>();
const active = new Map<string, ActiveCall>();

export const FrontendToolRegistry = {
  register<Schema extends ZodOrJsonSchema, Result>(
    tool: FrontendToolDefinition<Schema, Result>
  ): () => boolean {
    registry.set(tool.name, tool);
    return () => registry.delete(tool.name);
  },
  getManifest(): FrontendToolManifestEntry[] {
    return Array.from(registry.values()).map(
      ({ name, description, parameters }) => ({
        name,
        description,
        parameters: isZodSchema(parameters)
          ? zodToJsonSchema(parameters)
          : parameters
      })
    );
  },
  has(name: string): boolean {
    return registry.has(name);
  },
  get(name: string): RegisteredTool | undefined {
    return registry.get(name);
  },
  async call(
    name: string,
    args: unknown,
    toolCallId: string,
    ctx: Omit<FrontendToolContext, "abortSignal">
  ): Promise<unknown> {
    const tool = registry.get(name);
    if (!tool) {throw new Error(`Unknown tool: ${name}`);}
    const controller = new AbortController();
    active.set(toolCallId, { controller });
    try {
      const validatedArgs = isZodSchema(tool.parameters)
        ? parseWithTypeCoercion(tool.parameters, args)
        : args;

      const result = await tool.execute(validatedArgs as never, {
        abortSignal: controller.signal,
        getState: ctx.getState
      });

      return result;
    } finally {
      active.delete(toolCallId);
    }
  },
  abortAll(): void {
    for (const { controller } of active.values()) {controller.abort();}
    active.clear();
  }
};
