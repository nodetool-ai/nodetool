/**
 * `run_node` for a host with no chat turn: run one node as an inline graph
 * through the execution service, the path `run_workflow` and `render_timeline`
 * already take.
 *
 * The chat turn reads the node's own `node_update` result. A service run only
 * reports what Output nodes collect, and a node with no outgoing edge reports
 * its values as an unnamed list. So the graph wires one Output node per
 * declared slot, named after the slot, and the answer maps them back.
 */

import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  runWorkflow,
  type WorkflowRunEnvironment
} from "@nodetool-ai/execution/service";
import { isRecord, isString } from "../lib/wire-values.js";
import type { RunNodeFn } from "./run-node-tool.js";

const NODE_ID = "node_0";

/** The slot a node reports when the registry has no metadata for it. */
const FALLBACK_SLOT = "output";

/** The node, plus one named Output node per output slot. */
export function singleNodeGraph(
  nodeType: string,
  inputs: Record<string, unknown>,
  slots: readonly string[]
): { nodes: Record<string, unknown>[]; edges: Record<string, unknown>[] } {
  const nodes: Record<string, unknown>[] = [
    { id: NODE_ID, type: nodeType, data: inputs }
  ];
  const edges: Record<string, unknown>[] = [];
  for (const slot of slots) {
    const outputId = `output_${slot}`;
    nodes.push({
      id: outputId,
      type: "nodetool.output.Output",
      data: { name: slot }
    });
    edges.push({
      id: `${NODE_ID}-${slot}`,
      source: NODE_ID,
      sourceHandle: slot,
      target: outputId,
      targetHandle: "value"
    });
  }
  return { nodes, edges };
}

/**
 * Output values by slot. An Output node collects a list; a one-shot node fills
 * it with one value, which is answered bare, and a streaming node keeps its list.
 */
function outputsBySlot(
  outputs: unknown,
  slots: readonly string[]
): Record<string, unknown> {
  const collected = isRecord(outputs) ? outputs : {};
  const result: Record<string, unknown> = {};
  for (const slot of slots) {
    const values = collected[slot];
    if (values === undefined) continue;
    result[slot] =
      Array.isArray(values) && values.length === 1 ? values[0] : values;
  }
  return result;
}

/** A `RunNodeFn` over the execution service, for one user. */
export function serviceNodeRunner(options: {
  userId: string;
  registry: NodeRegistry | undefined;
  environment: () => Promise<WorkflowRunEnvironment | null>;
}): RunNodeFn {
  return async (nodeType, inputs) => {
    const environment = await options.environment();
    if (!environment) {
      return {
        error:
          "Cannot run a node: no node registry is available in this process."
      };
    }
    const metadata = (options.registry ?? environment.registry).resolveMetadata(
      nodeType
    );
    const declared = (metadata?.outputs ?? [])
      .map((output) => output.name)
      .filter(isString);
    const slots = declared.length > 0 ? declared : [FALLBACK_SLOT];
    const outcome = await runWorkflow({
      workflowId: "",
      userId: options.userId,
      environment,
      graph: singleNodeGraph(nodeType, inputs, slots),
      jobName: `Run ${nodeType}`
    });
    if (outcome.kind === "error") {
      return outcome.missingPack ?? { error: outcome.detail };
    }
    const { payload } = outcome;
    if (payload["status"] === "failed") {
      return (
        payload["missingPack"] ?? {
          error: isString(payload["error"])
            ? payload["error"]
            : `Node '${nodeType}' failed`
        }
      );
    }
    return outputsBySlot(payload["outputs"], slots);
  };
}
