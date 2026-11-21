/**
 * Argument parsing for headless tool bridges: the in-memory editors the evals
 * and server-side document sessions drive with the browser's `ui_*` contracts.
 */
import { z } from "zod";
import { parseWithTypeCoercion } from "@nodetool-ai/runtime";
import { USER_MESSAGE_FIELD } from "../tools/base-tool.js";
import { TOOL_CALL_ID_FIELD } from "../tools/subtask-fields.js";

/**
 * Close an object schema to unknown keys. A bridge that strips an unknown key
 * reports success for a call that changed nothing: `speaker` instead of
 * `speakerId` added a line with no speaker. A schema that already sets its
 * own policy (strict, passthrough, catchall) keeps it.
 */
export function closedParams(parameters: z.ZodTypeAny): z.ZodTypeAny {
  if (!(parameters instanceof z.ZodObject)) return parameters;
  return parameters.def.catchall === undefined ? parameters.strict() : parameters;
}

/**
 * Parse one bridge call: the reserved protocol fields lifted out, then the
 * rest against `closed`, a schema from {@link closedParams}.
 */
export function parseBridgeArgs(
  closed: z.ZodTypeAny,
  args: Record<string, unknown> | undefined
): Record<string, unknown> {
  const {
    [USER_MESSAGE_FIELD]: _message,
    [TOOL_CALL_ID_FIELD]: _toolCallId,
    ...rest
  } = args ?? {};
  return parseWithTypeCoercion(closed, rest) as Record<string, unknown>;
}

/**
 * Add the document-id field the browser's copy of a tool takes (`asset_id`,
 * `sketch_id`, `timeline_id`, …) as an optional string. A headless bridge
 * edits one implicit document, so it accepts any value. Without the field a
 * model that passes the id, as the product requires, would be refused by
 * {@link closedParams}.
 */
export function withHostField(parameters: z.ZodTypeAny, field: string): z.ZodTypeAny {
  if (!(parameters instanceof z.ZodObject) || field in parameters.shape) return parameters;
  return parameters.extend({
    [field]: z
      .string()
      .optional()
      .describe("Id of the open document, as the ui_context block lists it.")
  });
}

