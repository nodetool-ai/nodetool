import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { InputMode } from "@nodetool-ai/protocol";
import { tagAsUniversal } from "@nodetool-ai/nodes-utils";
import { streamInnerGraph } from "./run-inner-graph.js";

/**
 * What the editor stores when an app is picked: the operation the node runs,
 * the graph of the workflow behind it, and the input values the app fixes
 * itself (operation inputs mapped to a constant or a variable), keyed by the
 * input name the run protocol takes.
 */
interface AppSnapshot {
  name?: string;
  operation_id?: string;
  workflow_id?: string;
  graph?: { nodes?: unknown[]; edges?: unknown[] };
  constants?: Record<string, unknown>;
}

const OWN_PROPS = new Set(["app_id", "app_json"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * AppNode – runs a mini app's workflow operation inside a graph.
 *
 * The app's inputs (the operation's Input nodes the app user fills in) are the
 * node's dynamic inputs, and its outputs (the workflow's Output nodes) are the
 * node's dynamic outputs. Inputs the app fixes to a constant or a variable stay
 * fixed. Every value an inner Output node emits is streamed out as it arrives.
 */
export class AppNode extends BaseNode {
  static readonly nodeType = "nodetool.workflows.app_node.App";
  static readonly title = "App";
  static readonly description =
    "Run a mini app inside a workflow. Select an app to expose its inputs and outputs; streamed results pass through as they arrive.\n    app, mini app, sub-workflow, reuse";
  static readonly supportsDynamicInputs = true;
  static readonly supportsDynamicOutputs = true;
  static readonly inputMode: InputMode = "buffered";
  static readonly inlineFields = ["app_id"];
  static readonly inputFields = [];

  @prop({ type: "str", default: "", title: "App" })
  declare app_id: string;

  @prop({ type: "dict", default: {}, title: "App Snapshot" })
  declare app_json: Record<string, unknown>;

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const snapshot: AppSnapshot = isRecord(this.app_json) ? this.app_json : {};
    const graph = snapshot.graph;
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      throw new Error(
        this.app_id
          ? "The selected app has no workflow to run. Select the app again."
          : "Select an app to run."
      );
    }
    if (!context) {
      throw new Error("AppNode requires a ProcessingContext to run apps.");
    }

    const params: Record<string, unknown> = isRecord(snapshot.constants)
      ? { ...snapshot.constants }
      : {};
    for (const [key, value] of this.dynamicProps) {
      if (!OWN_PROPS.has(key)) params[key] = value;
    }

    const stream = streamInnerGraph(context, graph, {
      params,
      jobPrefix: "app",
      workflowId: snapshot.workflow_id || undefined,
      failureLabel: `App "${snapshot.name || this.app_id}"`
    });
    for (;;) {
      const step = await stream.next();
      if (step.done) return;
      yield step.value;
    }
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    let result: Record<string, unknown> = {};
    for await (const partial of this.genProcess(context)) {
      result = { ...result, ...partial };
    }
    return result;
  }
}

export const APP_NODES = tagAsUniversal([AppNode]);
