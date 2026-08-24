import type { ZodType, output as ZodOutput } from "zod";
import {
  isZodSchema,
  parseWithTypeCoercion,
  zodToJsonSchema,
  type JsonSchema,
  type ZodOrJsonSchema
} from "@nodetool-ai/runtime/zod-schema";
import { NodeMetadata, Workflow, WorkflowList } from "../../stores/ApiTypes";
import { NodeStore } from "../../stores/NodeStore";
import type { FrontendToolResults } from "./frontendToolResults";

/** A tool's parsed args, or `unknown` when it declares a raw JSON schema. */
type InferToolArgs<Schema extends ZodOrJsonSchema> =
  Schema extends ZodType ? ZodOutput<Schema> : unknown;

/** What `ui_<name>` resolves to, read off {@link FrontendToolResults}. */
export type FrontendToolResult<Name extends string> =
  Name extends keyof FrontendToolResults ? FrontendToolResults[Name] : unknown;

export interface FrontendToolDefinition<
  Schema extends ZodOrJsonSchema = ZodOrJsonSchema,
  Name extends `ui_${string}` = `ui_${string}`
> {
  name: Name;
  description: string;
  parameters: Schema;
  requireUserConsent?: boolean;
  execute: (
    args: InferToolArgs<Schema>,
    ctx: FrontendToolContext
  ) => Promise<FrontendToolResult<Name>>;
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
  register<Schema extends ZodOrJsonSchema, Name extends `ui_${string}`>(
    tool: FrontendToolDefinition<Schema, Name>
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
  async call<Name extends string>(
    name: Name,
    args: unknown,
    toolCallId: string,
    ctx: Omit<FrontendToolContext, "abortSignal">
  ): Promise<FrontendToolResult<Name>> {
    const tool = registry.get(name);
    if (!tool) {throw new Error(`Unknown tool: ${name}`);}
    const controller = new AbortController();
    active.set(toolCallId, { controller });
    try {
      const validatedArgs = isZodSchema(tool.parameters)
        ? parseWithTypeCoercion(tool.parameters, args)
        : args;

      // SAFETY: `RegisteredTool` declares `args: never` so that every tool,
      // whatever its own schema, is assignable to one stored signature. The
      // args were just validated against this tool's own `parameters`, which
      // is the only thing that knows their real type.
      const result = await tool.execute(validatedArgs as never, {
        abortSignal: controller.signal,
        getState: ctx.getState
      });

      // SAFETY: the registry erases each tool's result to `unknown` because it
      // is keyed by a name only known at runtime. `register` checked this
      // tool's `execute` against `FrontendToolResults[name]`, so re-attaching
      // that entry here restores exactly the type the table already enforced.
      return result as FrontendToolResult<Name>;
    } finally {
      active.delete(toolCallId);
    }
  },
  abortAll(): void {
    for (const { controller } of active.values()) {controller.abort();}
    active.clear();
  }
};
