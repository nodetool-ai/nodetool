// Runs a graph through the TypeScript browser runner and prints every
// ProcessingMessage as one JSON line. The C++ runner's output is compared
// against this stream. The graph is first hydrated the way the server
// prepares a run_job_request graph, which the C++ runner also does.
//
//   node ts-reference.mjs <graph.json> [<params json>] [--job-summary]
//
// --job-summary adds the job summary the server sends after the kernel's
// terminal job_update (JobExecution._streamJobMessagesInner in
// packages/websocket), built from the run's RunResult.
import { readFileSync } from "node:fs";
import { Graph } from "@nodetool-ai/execution-core";
import { runWorkflow } from "@nodetool-ai/workflow-runner";
import { createGraphNodeTypeResolver, NodeRegistry } from "@nodetool-ai/node-sdk";
import * as constant from "@nodetool-ai/core-nodes/nodes/constant";
import * as control from "@nodetool-ai/core-nodes/nodes/control";
import * as input from "@nodetool-ai/core-nodes/nodes/input";
import { OutputNode } from "@nodetool-ai/audio-nodes/nodes/output";

const args = process.argv.slice(2);
const jobSummary = args.includes("--job-summary");
const [graphPath, paramsJson = "{}"] = args.filter((a) => a !== "--job-summary");
const graph = JSON.parse(readFileSync(graphPath, "utf8"));
const classes = [constant, control, input]
  .flatMap((m) => Object.values(m))
  .filter((v) => typeof v === "function" && typeof v.nodeType === "string" && v.nodeType);
classes.push(OutputNode);
const registry = new NodeRegistry();
for (const c of classes) registry.register(c);

// JobExecution.normalizeGraph (packages/websocket), then Graph.loadFromDict
// with the registry resolver, as JobExecution.hydrateGraph does.
const normalized = {
  nodes: graph.nodes.map((n) => {
    if (n.properties === undefined && n.data !== undefined) {
      const { data, ...rest } = n;
      return { ...rest, properties: data };
    }
    return n;
  }),
  edges: graph.edges.map((edge) => {
    const rawEdgeType = edge.edge_type ?? edge.type;
    const { type, ...rest } = edge;
    return { ...rest, edge_type: rawEdgeType === "control" ? "control" : "data" };
  })
};
const hydrated = await Graph.loadFromDict(normalized, {
  resolver: createGraphNodeTypeResolver(registry).resolveNodeType
});

const gen = runWorkflow({
  graph: { nodes: [...hydrated.nodes], edges: [...hydrated.edges] },
  registry,
  params: JSON.parse(paramsJson),
  jobId: "job",
  workflowId: "wf",
  platform: "node"
});
let r = await gen.next();
let terminalSeen = false;
for (; !r.done; r = await gen.next()) {
  const status = r.value.type === "job_update" ? r.value.status : "";
  if (["completed", "failed", "cancelled"].includes(status)) terminalSeen = true;
  process.stdout.write(JSON.stringify(r.value) + "\n");
}
const outputs = r.value?.outputs ?? {};
if (jobSummary && (!terminalSeen || Object.keys(outputs).length > 0)) {
  const summary = {
    type: "job_update",
    status: r.value.status,
    job_id: "job",
    workflow_id: "wf",
    error: r.value.error,
    result: { outputs }
  };
  process.stdout.write(JSON.stringify(summary) + "\n");
}
process.exit(0);
