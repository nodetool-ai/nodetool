import { z } from "zod";
import type { ZodType } from "zod";
import { NodeMetadata, Workflow, WorkflowList } from "../../stores/ApiTypes";
import { NodeStore } from "../../stores/NodeStore";

export type JsonSchema = Record<string, unknown>;
export type ZodOrJsonSchema = ZodType | JsonSchema;

export interface FrontendToolDefinition<Result = unknown> {
  name: `ui_${string}`;
  description: string;
  parameters: ZodOrJsonSchema;
  /**
   * Excludes the tool from the LLM-facing manifest (token savings) while still
   * allowing direct calls by name for backwards compatibility.
   */
  hidden?: boolean;
  requireUserConsent?: boolean;
  // Use `any` here to allow destructured parameters in tool implementations
  execute: (args: any, ctx: FrontendToolContext) => Promise<Result>;
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
      case "ZodObject": {
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
      }
      case "ZodOptional":
        return zodToJsonSchema(def.innerType as ZodType);
      case "ZodNullable":
        return {
          anyOf: [zodToJsonSchema(def.innerType as ZodType), { type: "null" }]
        };
      case "ZodDefault":
        return zodToJsonSchema(def.innerType as ZodType);
      case "ZodUnion": {
        const options = (def.options as ZodType[]).map(zodToJsonSchema);
        return { anyOf: options };
      }
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

function cloneForMutation(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneForMutation(item));
  }
  if (value && typeof value === "object") {
    const cloned: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      cloned[key] = cloneForMutation(nested);
    }
    return cloned;
  }
  return value;
}

function getValueAtPath(value: unknown, path: Array<string | number>): unknown {
  let cursor = value;
  for (const segment of path) {
    if (Array.isArray(cursor) && typeof segment === "number") {
      cursor = cursor[segment];
      continue;
    }
    if (cursor && typeof cursor === "object" && typeof segment === "string") {
      cursor = (cursor as Record<string, unknown>)[segment];
      continue;
    }
    return undefined;
  }
  return cursor;
}

function setValueAtPath(
  value: unknown,
  path: Array<string | number>,
  nextValue: unknown
): boolean {
  if (path.length === 0) {
    return false;
  }
  let cursor = value;
  for (let index = 0; index < path.length - 1; index++) {
    const segment = path[index];
    if (Array.isArray(cursor) && typeof segment === "number") {
      cursor = cursor[segment];
      continue;
    }
    if (cursor && typeof cursor === "object" && typeof segment === "string") {
      cursor = (cursor as Record<string, unknown>)[segment];
      continue;
    }
    return false;
  }

  const last = path[path.length - 1];
  if (Array.isArray(cursor) && typeof last === "number") {
    cursor[last] = nextValue;
    return true;
  }
  if (cursor && typeof cursor === "object" && typeof last === "string") {
    (cursor as Record<string, unknown>)[last] = nextValue;
    return true;
  }
  return false;
}

function coerceStringValueForExpectedType(
  value: unknown,
  expected: string
): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim();
  if (expected === "boolean") {
    const lower = normalized.toLowerCase();
    if (lower === "true") {
      return true;
    }
    if (lower === "false") {
      return false;
    }
    return value;
  }

  if (expected === "number") {
    if (!normalized) {
      return value;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return value;
}

function parseWithTypeCoercion(schema: ZodType, args: unknown): unknown {
  try {
    return schema.parse(args);
  } catch (error) {
    if (!(error instanceof z.ZodError)) {
      throw error;
    }

    const coercibleIssues: Array<{
      issue: z.ZodIssue;
      expected: "boolean" | "number";
    }> = [];
    for (const issue of error.issues) {
      if (issue.code !== "invalid_type") {
        continue;
      }
      const expected =
        typeof (issue as { expected?: unknown }).expected === "string"
          ? ((issue as { expected?: string }).expected as string)
          : null;
      if (expected === "boolean" || expected === "number") {
        coercibleIssues.push({ issue, expected });
      }
    }
    if (coercibleIssues.length === 0) {
      throw error;
    }

    const coercedArgs = cloneForMutation(args);
    let changed = false;
    for (const { issue, expected } of coercibleIssues) {
      const path = issue.path.filter(
        (segment: unknown): segment is string | number =>
          typeof segment === "string" || typeof segment === "number"
      );
      const currentValue = getValueAtPath(coercedArgs, path);
      const nextValue = coerceStringValueForExpectedType(
        currentValue,
        expected
      );
      if (nextValue !== currentValue && setValueAtPath(coercedArgs, path, nextValue)) {
        changed = true;
      }
    }

    if (!changed) {
      throw error;
    }

    return schema.parse(coercedArgs);
  }
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
