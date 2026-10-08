/**
 * Step 1's import alternative (PRD § 11.1): a workflow file onto this workflow.
 *
 * A `.json` file is a graph and is applied here. A DSL `.ts` file is a program
 * — evaluating it needs the sandbox the browser does not host — so it is
 * refused by name, pointing at the command that does run it. Saying that is
 * better than accepting the file and placing nothing.
 */

import { graph as graphSchema } from "@nodetool-ai/protocol/api-schemas/workflows.js";

import type { WorkflowManagerState } from "../../stores/WorkflowManagerStore";
import { graphEdgeToReactFlowEdge } from "../../stores/graphEdgeToReactFlowEdge";
import { graphNodeToReactFlowNode } from "../../stores/graphNodeToReactFlowNode";

export interface ImportedWorkflowGraph {
  nodes: unknown[];
  edges: unknown[];
}

/** The one place that decides what a picked workflow file becomes. */
export async function readWorkflowFile(
  file: File
): Promise<ImportedWorkflowGraph> {
  if (file.name.endsWith(".ts")) {
    throw new Error(
      `${file.name} is a DSL program, not a graph. Run it with \`nodetool run ${file.name}\` and open the workflow it writes.`
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch (cause) {
    throw new Error(
      `${file.name} is not valid JSON: ${
        cause instanceof Error ? cause.message : String(cause)
      }`
    );
  }
  // An exported workflow carries its graph under `graph`; a bare graph is the
  // graph itself. Both are what someone drops in.
  const candidate =
    parsed !== null &&
    typeof parsed === "object" &&
    "graph" in (parsed as Record<string, unknown>)
      ? (parsed as Record<string, unknown>)["graph"]
      : parsed;
  const result = graphSchema.safeParse(candidate);
  if (!result.success) {
    throw new Error(
      `${file.name} has no workflow graph in it: expected { nodes, edges }.`
    );
  }
  return { nodes: result.data.nodes, edges: result.data.edges };
}

/**
 * Put an imported graph on an open workflow and save it.
 *
 * The setup flow's stage write that follows saves the canvas, not the row, so
 * the graph has to reach the canvas too or that save writes it back empty.
 */
export async function importWorkflowGraph(
  state: Pick<
    WorkflowManagerState,
    "getWorkflow" | "updateWorkflow" | "getNodeStore" | "saveWorkflow"
  >,
  workflowId: string,
  imported: ImportedWorkflowGraph
): Promise<void> {
  const workflow = state.getWorkflow(workflowId);
  if (!workflow) {
    throw new Error(`Workflow ${workflowId} is not open.`);
  }
  const graph = imported as NonNullable<typeof workflow.graph>;
  const next = { ...workflow, graph };
  state.updateWorkflow(next);
  const nodeStore = state.getNodeStore(workflowId)?.getState();
  if (nodeStore) {
    nodeStore.setNodes(
      graph.nodes.map((node) => graphNodeToReactFlowNode(next, node))
    );
    nodeStore.setEdges(graph.edges.map(graphEdgeToReactFlowEdge));
  }
  await state.saveWorkflow(nodeStore?.getWorkflow() ?? next);
}
