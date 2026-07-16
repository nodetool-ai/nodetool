import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { ToolLike } from "./agent-utils.js";

// ---------------------------------------------------------------------------
// Control tool support for Agent nodes with outgoing control edges
// ---------------------------------------------------------------------------

/**
 * Marker symbol to identify control tools built from _control_context.
 */
const CONTROL_TOOL_MARKER = Symbol("controlTool");

interface ControlToolLike extends ToolLike {
  [CONTROL_TOOL_MARKER]: true;
  targetNodeId: string;
  allowedProperties: ReadonlySet<string>;
}

export function isControlTool(tool: ToolLike): tool is ControlToolLike {
  return (
    CONTROL_TOOL_MARKER in tool &&
    (tool as ControlToolLike)[CONTROL_TOOL_MARKER] === true
  );
}

/**
 * Sanitize a node title to a valid tool name (snake_case, max 64 chars).
 * Prefixed with `run_` to avoid collisions with provider-reserved built-in
 * tool names (e.g. Gemini's native `google_search`, which would otherwise
 * shadow our schema and pass `queries` instead of the node's actual props).
 */
function sanitizeControlToolName(name: string): string {
  const fallback = "run_node";
  if (!name) return fallback;
  let s = name
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!s) return fallback;
  s = `run_${s}`;
  if (s.length > 64) s = s.slice(0, 64);
  return s;
}

/**
 * Build ControlToolLike instances from `_control_context` input.
 * These tools allow the agent's LLM to call controlled nodes via tool-calling.
 */
export function buildControlTools(controlContext: unknown): ControlToolLike[] {
  if (!controlContext || typeof controlContext !== "object") return [];

  const tools: ControlToolLike[] = [];
  const usedNames = new Set<string>();

  for (const [targetId, info] of Object.entries(
    controlContext as Record<string, unknown>
  )) {
    if (!info || typeof info !== "object") continue;
    const nodeInfo = info as Record<string, unknown>;

    const nodeTitle = String(
      nodeInfo.node_title ?? nodeInfo.node_type ?? targetId
    );
    const baseName = sanitizeControlToolName(nodeTitle);
    let toolName = baseName;
    let suffix = 2;
    while (usedNames.has(toolName)) {
      const suffixText = `_${suffix}`;
      toolName = `${baseName.slice(0, 64 - suffixText.length)}${suffixText}`;
      suffix++;
    }
    usedNames.add(toolName);

    // Build input schema from control_actions.run.properties
    const actions = (nodeInfo.control_actions ?? {}) as Record<string, unknown>;
    const runAction = (actions.run ?? {}) as Record<string, unknown>;
    const rawProperties = (runAction.properties ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    const properties: Record<string, Record<string, unknown>> = {};
    for (const [key, schema] of Object.entries(rawProperties)) {
      if (typeof schema === "object" && schema !== null) {
        properties[key] = { ...schema };
      } else {
        properties[key] = { type: "string", description: String(schema) };
      }
    }

    const inputSchema = {
      type: "object",
      properties,
      required: [] as string[],
      additionalProperties: false
    };

    let description = `Control ${nodeTitle}: trigger execution with optional property overrides`;
    const propNames = Object.keys(properties);
    if (propNames.length > 0) {
      description += `. Available properties: ${propNames.join(", ")}`;
    }

    tools.push({
      [CONTROL_TOOL_MARKER]: true as const,
      targetNodeId: targetId,
      allowedProperties: new Set(Object.keys(properties)),
      name: toolName,
      description,
      inputSchema,
      // Stub process — actual execution goes through sendControlEvent
      async process(_ctx: ProcessingContext, _params: Record<string, unknown>) {
        return { status: "dispatched", target: targetId };
      },
      toProviderTool() {
        return { name: toolName, description, inputSchema };
      }
    });
  }

  return tools;
}
