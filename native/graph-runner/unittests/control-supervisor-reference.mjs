// Uses the exact graphs exported by gr_public_control_supervisor_tests --graphs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WorkflowRunner, Graph } from "@nodetool-ai/execution-core";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { NodeRegistry, createGraphNodeTypeResolver } from "@nodetool-ai/node-sdk";
import { RepeatValueStreamNode, ForEachNode, CollectNode } from "@nodetool-ai/core-nodes/nodes/control";
import { ConstantSelectNode } from "@nodetool-ai/core-nodes/nodes/constant";
import { OutputNode } from "@nodetool-ai/audio-nodes/nodes/output";

const fixtures = JSON.parse(readFileSync(process.argv[2], "utf8"));
const registry = new NodeRegistry();
for (const cls of [RepeatValueStreamNode, ForEachNode, CollectNode, ConstantSelectNode, OutputNode]) registry.register(cls);
for (const [name, expectedCalls, expectedValues] of [["repeat", 3, []], ["varying", 2, ["good", "good"]]]) {
  const graph = await Graph.loadFromDict(fixtures[name], { resolver: createGraphNodeTypeResolver(registry).resolveNodeType });
  const context = new ProcessingContext({ jobId: name, workflowId: "controlled-supervisor", inheritHostDefaults: false });
  let decisions = 0;
  const runner = new WorkflowRunner(name, {
    executionContext: context,
    resolveExecutor: (node) => registry.resolve(node),
    supervisor: {
      async decide() { ++decisions; return { verdict: { action: "skip" }, decidedBy: "agent" }; },
      close() {}
    }
  });
  const result = await runner.run({ job_id: name, workflow_id: "controlled-supervisor", params: {} }, { nodes: [...graph.nodes], edges: [...graph.edges] });
  console.log(JSON.stringify({ name, status: result.status, decisions, outputs: result.outputs }));
  assert.equal(result.status, "completed");
  assert.equal(decisions, expectedCalls);
  assert.deepEqual(result.outputs.selected, [expectedValues]);
}
