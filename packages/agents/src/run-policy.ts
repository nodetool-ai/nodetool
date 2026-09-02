/**
 * The run-level execution policy stamped onto planner-authored Agent nodes.
 *
 * `authorGraph` emits bare `nodetool.agents.Agent` nodes: no model (it cannot
 * know which are configured), no system prompt, no turn budget. The run owns
 * all three, so a planned graph is only runnable once this has been applied —
 * otherwise every Agent node dies on "Select a model".
 */

import type { GraphData } from "@nodetool-ai/protocol";
import { AGENT_NODE_TYPE } from "./graph-builder.js";
import { isString } from "./utils/type-guards.js";

/** The run-level execution policy stamped onto planner-authored Agent nodes. */
export interface RunPolicy {
  providerId: string;
  modelId: string;
  systemPrompt?: string;
  maxStepIterations?: number;
  maxTokens?: number;
}

/**
 * Stamp the run's execution policy onto planner-authored Agent nodes.
 *
 * A property the node already carries wins — a hand-authored graph, or a model
 * the planner pinned via `find_model`, is never overwritten.
 */
export function applyRunPolicy(
  graphData: GraphData,
  policy: RunPolicy
): GraphData {
  const { providerId, modelId, systemPrompt, maxStepIterations, maxTokens } =
    policy;
  return {
    ...graphData,
    nodes: graphData.nodes.map((node) => {
      if (node.type !== AGENT_NODE_TYPE) return node;
      const properties = { ...(node.properties ?? {}) };

      const model = properties["model"] as
        | { provider?: string; id?: string }
        | undefined;
      if (!model?.provider || model.provider === "empty" || !model.id) {
        properties["model"] = {
          type: "language_model",
          provider: providerId,
          id: modelId,
          name: modelId,
          path: null,
          supported_tasks: []
        };
      }

      // The run's system prompt carries the merged skill/memory instructions.
      const system = properties["system"];
      if (systemPrompt && (!isString(system) || system.length === 0)) {
        properties["system"] = systemPrompt;
      }

      // `maxStepIterations` is the run's per-step turn budget; on the node it
      // is `max_turns`, which otherwise defaults to 100.
      if (maxStepIterations !== undefined && properties["max_turns"] == null) {
        properties["max_turns"] = maxStepIterations;
      }

      // Same for the run's output-token cap, which the node calls `max_tokens`.
      if (maxTokens !== undefined && properties["max_tokens"] == null) {
        properties["max_tokens"] = maxTokens;
      }

      return { ...node, properties };
    })
  };
}
