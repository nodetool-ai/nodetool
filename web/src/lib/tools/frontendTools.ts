import { z } from "zod";
import type { ZodType } from "zod";
import { NodeMetadata, Workflow } from "../../stores/ApiTypes";
import { NodeStore } from "../../stores/NodeStore";

export type JsonSchema = Record<string, any>;
export type ZodOrJsonSchema = ZodType | JsonSchema;

export interface FrontendToolDefinition<Args = any, Result = any> {
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

/**
 * Check if a schema is a Zod schema
 */
function isZodSchema(schema: ZodOrJsonSchema): schema is ZodType {
  return typeof schema === "object" && schema !== null && "_def" in schema;
}

/**
 * Convert a Zod schema to JSON Schema format for the manifest
 */
function zodToJsonSchema(schema: ZodType): JsonSchema {
  if ("_def" in schema && "typeName" in (schema as any)._def) {
    const def = (schema as any)._def;
    switch (def.typeName()) {
      case "ZodString":
        return { type: "string" };
      case "ZodNumber":
        return { type: "number" };
      case "ZodBoolean":
        return { type: "boolean" };
      case "ZodArray":
        return {
          type: "array",
          items: zodToJsonSchema(def.type as ZodType)
        };
      case "ZodObject":
        const shape = def.shape();
        const properties: Record<string, JsonSchema> = {};
        const required: string[] = [];
        for (const [key, value] of Object.entries(shape)) {
          const fieldSchema = value as ZodType;
          properties[key] = zodToJsonSchema(fieldSchema);
          const fieldDef = (fieldSchema as any)._def;
          const isDefault =
            typeof fieldDef?.typeName === "function" &&
            fieldDef.typeName() === "ZodDefault";
          if (
            !fieldSchema.isOptional() &&
            !fieldSchema.isNullable() &&
            !isDefault
          ) {
            required.push(key);
          }
        }
        return { type: "object", properties, required };
      case "ZodOptional":
        return zodToJsonSchema(def.innerType as ZodType);
      case "ZodNullable":
        return {
          anyOf: [zodToJsonSchema(def.innerType as ZodType), { type: "null" }]
        };
      case "ZodDefault":
        return zodToJsonSchema(def.innerType as ZodType);
      case "ZodUnion":
        const options = (def.options as ZodType[]).map(zodToJsonSchema);
        return { anyOf: options };
      case "ZodLiteral":
        return { const: def.value };
      case "ZodEnum":
        return { enum: def.values };
      case "ZodEffects":
        return zodToJsonSchema(def.schema as ZodType);
      case "ZodRecord":
        return {
          type: "object",
          additionalProperties: zodToJsonSchema(def.valueType as ZodType)
        };
      case "ZodAny":
        return {};
      case "ZodUnknown":
        return {};
      default:
        break;
    }
  }
  return {};
}

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
    args: any,
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
        ? tool.parameters.parse(args)
        : args;

      const result = await tool.execute(validatedArgs, {
        abortSignal: controller.signal,
        getState: ctx.getState
      });

      if (name === "ui_search_nodes") {
        console.log("[FrontendToolRegistry] Search results:", result);
      }

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
