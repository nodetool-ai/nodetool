/**
 * `run_node` — execute a single NodeTool node by type and return its output.
 *
 * Lives in the websocket package because running a node requires the kernel
 * machinery (executor resolution, node hydration, WorkflowRunner) that the
 * runner owns. The tool itself is a thin wrapper around a `runNode` callback
 * supplied by the runner.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Tool } from "@nodetool-ai/agents";

export type RunNodeFn = (
  nodeType: string,
  inputs: Record<string, unknown>
) => Promise<unknown>;

export class RunNodeTool extends Tool {
  readonly name = "run_node";
  readonly description =
    "Run a single NodeTool node by its fully-qualified type and return its " +
    "output. Use list_nodes / search_nodes / get_node_info to discover node " +
    "types and their inputs first. For multi-node pipelines, prefer " +
    "run_workflow.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      node_type: {
        type: "string" as const,
        description:
          "Fully-qualified node type, e.g. 'nodetool.text.Concat' or " +
          "'nodetool.image.Blur'."
      },
      inputs: {
        type: "object" as const,
        description:
          "Input values keyed by the node's property names. Omit for nodes " +
          "with no required inputs."
      }
    },
    required: ["node_type"]
  };

  private readonly runNode: RunNodeFn;

  constructor(runNode: RunNodeFn) {
    super();
    this.runNode = runNode;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const nodeType = String(params["node_type"] ?? "");
    if (!nodeType) return { error: "node_type is required" };
    const inputs =
      params["inputs"] && typeof params["inputs"] === "object"
        ? (params["inputs"] as Record<string, unknown>)
        : {};
    return this.runNode(nodeType, inputs);
  }

  userMessage(params: Record<string, unknown>): string {
    const t = params["node_type"];
    return t ? `Running node ${t}` : "Running node";
  }
}
