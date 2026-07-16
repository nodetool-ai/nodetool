import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { InputMode, OutputCorrelation } from "@nodetool-ai/protocol";
import { tagAsUniversal } from "@nodetool-ai/nodes-utils";
import { runInnerGraph } from "./run-inner-graph.js";

/**
 * WorkflowNode – executes a sub-workflow selected by the user.
 *
 * The frontend stores the selected workflow's graph in `workflow_json`
 * and maps its input/output nodes to dynamic inputs/outputs.
 * This node creates a child WorkflowRunner, dispatches dynamic input
 * values as params, runs the sub-workflow, and returns collected outputs.
 */
export class WorkflowNode extends BaseNode {
  static readonly nodeType = "nodetool.workflows.workflow_node.Workflow";
  static readonly title = "Workflow";
  static readonly description =
    "Execute a sub-workflow. Select a workflow to populate its inputs and outputs dynamically.";
  static readonly supportsDynamicInputs = true;
  static readonly supportsDynamicOutputs = true;
  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "single", source: "__execution__" }
  };
  static readonly inlineFields = ["workflow_id"];
  static readonly inputFields = [];

  @prop({ type: "str", default: "" })
  declare workflow_id: string;

  @prop({ type: "dict", default: {} })
  declare workflow_json: Record<string, unknown>;

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const workflowJson = this.workflow_json;
    if (!workflowJson || !workflowJson.graph) {
      yield {};
      return;
    }

    const graph = workflowJson.graph as {
      nodes?: unknown[];
      edges?: unknown[];
    };
    if (!graph.nodes || !graph.edges) {
      yield {};
      return;
    }

    if (!context) {
      throw new Error(
        "WorkflowNode requires a ProcessingContext to run sub-workflows."
      );
    }

    // Collect dynamic input values as params for the sub-workflow's input nodes
    const params: Record<string, unknown> = {};
    for (const [key, value] of this.dynamicProps) {
      if (key !== "workflow_id" && key !== "workflow_json") {
        params[key] = value;
      }
    }

    const output = await runInnerGraph(context, graph, {
      params,
      jobPrefix: "sub",
      workflowId: this.workflow_id || undefined,
      failureLabel: "Sub-workflow"
    });

    yield output;
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    // genProcess is the primary path; this fallback collects its output.
    let result: Record<string, unknown> = {};
    for await (const partial of this.genProcess(context)) {
      result = { ...result, ...partial };
    }
    return result;
  }
}

export const WORKFLOW_NODES = tagAsUniversal([WorkflowNode]);
