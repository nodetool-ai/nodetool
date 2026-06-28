/**
 * Abstract base class for all agent tools.
 *
 * Port of src/nodetool/agents/tools/base.py
 */

import {
  parseWithTypeCoercion,
  zodToJsonSchema,
  type JsonSchema,
  type ProcessingContext,
  type ProviderTool
} from "@nodetool-ai/runtime";
import { z, type ZodType } from "zod";
import { TOOL_CALL_ID_FIELD } from "./subtask-fields.js";

/**
 * Reserved input-schema field the LLM populates with a short, user-facing
 * status message describing what the tool call is about to do. Stripped from
 * params before they reach `process()` so individual tools don't need to know
 * about it.
 */
export const USER_MESSAGE_FIELD = "_message";

const USER_MESSAGE_SCHEMA_DESCRIPTION =
  "Short user-facing status describing what you are about to do (5-12 words, " +
  "present continuous, e.g. \"Reading config.json\", \"Searching the web for " +
  "AI trends\", \"Adding image generator node\"). Shown in the UI while the " +
  "tool runs. Set this on EVERY tool call.";

export abstract class Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  protected readonly jsonSchema?: JsonSchema;

  /**
   * Opt-in: when `true`, {@link StepExecutor} injects the LLM-assigned
   * `tool_call_id` into the args under the reserved `_tool_call_id` field
   * before calling {@link process}. Only tools that need to forward nested
   * events (currently {@link RunSubtaskTool}) should set this.
   */
  readonly needsToolCallId: boolean = false;

  get schema(): ZodType | undefined {
    return undefined;
  }

  get inputSchema(): JsonSchema {
    if (this.schema) {
      return zodToJsonSchema(this.schema);
    }
    return this.jsonSchema ?? { type: "object", properties: {} };
  }

  /**
   * Execute the tool with the given parameters.
   */
  abstract process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown>;

  async execute(
    context: ProcessingContext,
    params: Record<string, unknown> | null | undefined,
    options: { toolCallId?: string } = {}
  ): Promise<unknown> {
    const cleanArgs = Tool.stripMessage(params);
    if (this.needsToolCallId && options.toolCallId) {
      cleanArgs[TOOL_CALL_ID_FIELD] = options.toolCallId;
    }
    if (!this.schema) {
      return this.process(context, cleanArgs);
    }

    const parsed = this.parseParams(cleanArgs);
    if (!parsed.success) {
      return {
        error: "invalid_tool_arguments",
        message: `Invalid arguments for ${this.name}: ${parsed.message}`,
        issues: parsed.issues
      };
    }

    return this.process(context, parsed.data);
  }

  static async executeTool(
    tool: Tool,
    context: ProcessingContext,
    params: Record<string, unknown> | null | undefined,
    options: { toolCallId?: string } = {}
  ): Promise<unknown> {
    const candidate = tool as Tool & {
      execute?: (
        context: ProcessingContext,
        params: Record<string, unknown> | null | undefined,
        options?: { toolCallId?: string }
      ) => Promise<unknown>;
    };
    if (typeof candidate.execute === "function") {
      return candidate.execute(context, params, options);
    }

    const cleanArgs = Tool.stripMessage(params);
    if (tool.needsToolCallId && options.toolCallId) {
      cleanArgs[TOOL_CALL_ID_FIELD] = options.toolCallId;
    }
    return tool.process(context, cleanArgs);
  }

  /**
   * Convert this tool to the provider tool format expected by BaseProvider.
   *
   * The returned schema has a `_message` string property merged in so the LLM
   * can attach a one-line user-facing status to every call (see
   * `USER_MESSAGE_SCHEMA_DESCRIPTION`). The field is optional — older models
   * may omit it, in which case the per-tool `userMessage()` fallback runs.
   */
  toProviderTool(): ProviderTool {
    return {
      name: this.name,
      description: this.description,
      inputSchema: injectUserMessageField(this.inputSchema)
    };
  }

  /**
   * Return a user-facing message describing this tool call. Subclasses override
   * to render parameter-aware templates (e.g. "Reading config.json"); the
   * LLM-provided `_message` is preferred via {@link Tool.resolveMessage} when
   * present.
   */
  userMessage(params: Record<string, unknown>): string {
    const llm = Tool.extractMessage(params);
    if (llm) return llm;
    return `Running ${this.name}`;
  }

  /**
   * Extract the LLM-authored `_message` from a tool-call args object. Returns
   * a trimmed string or `null` if absent / empty / wrong type.
   */
  static extractMessage(
    params: Record<string, unknown> | null | undefined
  ): string | null {
    if (!params) return null;
    const raw = params[USER_MESSAGE_FIELD];
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Return a shallow copy of `params` with the reserved `_message` field
   * removed. Use this before passing args to `tool.process()` so tools never
   * see the protocol field.
   */
  static stripMessage(
    params: Record<string, unknown> | null | undefined
  ): Record<string, unknown> {
    if (!params) return {};
    if (!(USER_MESSAGE_FIELD in params)) return params;
    const out = { ...params };
    delete out[USER_MESSAGE_FIELD];
    return out;
  }

  /**
   * Resolve the user-facing message for a tool call: prefer the LLM-provided
   * `_message`, fall back to the tool's parameter-aware template.
   */
  static resolveMessage(
    tool: Tool,
    params: Record<string, unknown> | null | undefined
  ): string {
    const llm = Tool.extractMessage(params ?? {});
    if (llm) return llm;
    return tool.userMessage(Tool.stripMessage(params ?? {}));
  }

  private parseParams(
    params: Record<string, unknown>
  ):
    | { success: true; data: Record<string, unknown> }
    | { success: false; message: string; issues: string[] } {
    if (!this.schema) {
      return { success: true, data: params };
    }

    try {
      const parsed = parseWithTypeCoercion(this.schema, params);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { success: true, data: parsed as Record<string, unknown> };
      }
      return {
        success: false,
        message: "expected an object",
        issues: ["expected an object"]
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map((issue) => {
          const path = issue.path.join(".");
          return path ? `${path}: ${issue.message}` : issue.message;
        });
        return {
          success: false,
          message: issues.join("; "),
          issues
        };
      }
      return {
        success: false,
        message: String(error),
        issues: [String(error)]
      };
    }
  }
}

function injectUserMessageField(
  schema: Record<string, unknown>
): Record<string, unknown> {
  // Only object-type schemas have a `properties` map we can extend. Every tool
  // in the codebase declares an object schema; bail out cleanly if a custom
  // tool ever uses something exotic.
  if (schema["type"] !== "object") return schema;

  const existingProperties =
    (schema["properties"] as Record<string, unknown> | undefined) ?? {};
  if (USER_MESSAGE_FIELD in existingProperties) return schema;

  const out: Record<string, unknown> = {
    ...schema,
    properties: {
      ...existingProperties,
      [USER_MESSAGE_FIELD]: {
        type: "string",
        description: USER_MESSAGE_SCHEMA_DESCRIPTION
      }
    }
  };

  // Schemas that opt into OpenAI strict structured-output (`additionalProperties:
  // false`) require every key in `properties` to also appear in `required`.
  // Mirror `_message` into `required` for those tools so the provider doesn't
  // reject the schema at upload time. For lenient schemas we keep `_message`
  // optional so older models can omit it without a hard failure.
  if (schema["additionalProperties"] === false) {
    const existingRequired = Array.isArray(schema["required"])
      ? (schema["required"] as string[])
      : [];
    if (!existingRequired.includes(USER_MESSAGE_FIELD)) {
      out["required"] = [...existingRequired, USER_MESSAGE_FIELD];
    }
  }

  return out;
}
