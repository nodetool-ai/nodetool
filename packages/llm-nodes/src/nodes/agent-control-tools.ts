import { createLogger } from "@nodetool-ai/config";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { ToolLike } from "./agent-utils.js";

// ---------------------------------------------------------------------------
// Control tool support for Agent nodes with outgoing control edges
// ---------------------------------------------------------------------------

const log = createLogger("nodetool.base-nodes.agents");

/**
 * A control tool is a normal {@link ToolLike} whose `process` dispatches a
 * control event to a target node. `targetNodeId` is kept on the object for
 * diagnostics/logging by the caller; execution flows through the generic
 * `tool.process` path like any other tool.
 */
export interface ControlTool extends ToolLike {
  targetNodeId: string;
  process: (
    context: ProcessingContext,
    params: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
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
 * Build control tools from `_control_context` input. Each tool's `process`
 * filters the model's arguments to the node's declared properties, then
 * dispatches a control event through the context and returns the result — so
 * control tools run through the same generic `tool.process` path as any other
 * tool (including plan mode's ToolLikeAdapter).
 */
export function buildControlTools(controlContext: unknown): ControlTool[] {
  if (!controlContext || typeof controlContext !== "object") return [];

  const tools: ControlTool[] = [];
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

    const allowedProperties = new Set(propNames);

    tools.push({
      targetNodeId: targetId,
      name: toolName,
      description,
      inputSchema,
      async process(
        context: ProcessingContext,
        params: Record<string, unknown>
      ): Promise<Record<string, unknown>> {
        const callArgs = Object.fromEntries(
          Object.entries(params ?? {}).filter(([key]) =>
            allowedProperties.has(key)
          )
        );
        log.info("Control tool dispatching", {
          toolName,
          targetNodeId: targetId,
          argKeys: Object.keys(callArgs)
        });

        if (!context.hasControlEventSupport) {
          return {
            status: "error",
            target_node_id: targetId,
            error:
              "Control event dispatch is not available in this execution context"
          };
        }

        try {
          const result = await context.sendControlEvent(targetId, callArgs);
          return {
            status: "completed",
            target_node_id: targetId,
            result
          };
        } catch (err) {
          return {
            status: "error",
            target_node_id: targetId,
            error: err instanceof Error ? err.message : String(err)
          };
        }
      },
      toProviderTool() {
        return { name: toolName, description, inputSchema };
      }
    });
  }

  return tools;
}
