// Run after exporting the native fixture:
// NODETOOL_PARTIAL_PLAN_EXPORT=$HOME/.cache/mixed-plan.json <planner-test-binary> mixedListContributorsUseLosslessConstantFeeders
// node native/node-editor/tests/planner/run-mixed-plan.mjs $HOME/.cache/mixed-plan.json
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { WorkflowRunner } from "@nodetool-ai/kernel";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { ValueInputNode } from "@nodetool-ai/core-nodes";

const snapshot = JSON.parse(await readFile(process.argv[2], "utf8"));
const registry = new NodeRegistry();
registry.register(ValueInputNode);
assert(!snapshot.graph.nodes.some((node) => node.id === "g"));

async function execute(graph) {
  let observed;
  const calls = [];
  const runner = new WorkflowRunner("native-mixed-list-proof", {
    resolveExecutor(node) {
      calls.push(node.id);
      if (node.type === "nodetool.input.ValueInput") {
        return registry.resolve(node);
      }
      if (node.id === "live") {
        return { async process() { return { out: 3 }; } };
      }
      if (node.id === "target") {
        return { async process(inputs) { observed = inputs.input; return { out: observed }; } };
      }
      throw new Error(`Unexpected execution ${node.id}`);
    }
  });
  const result = await runner.run({ job_id: "native-mixed-list-proof", params: {} }, graph);
  assert.equal(result.status, "completed");
  assert(!calls.includes("g"));
  return observed;
}

// Same saved-graph normalization performed before dispatch, plus metadata's
// list declaration. Use the exact native plan, including original edge order.
const graph = {
  nodes: snapshot.graph.nodes.map(({ data, ...node }) => ({
    ...node,
    properties: data,
    ...(node.id === "target" ? { propertyTypes: { input: "list[int]" } } : {})
  })),
  edges: snapshot.graph.edges.map((edge) => ({ ...edge, edge_type: "data" }))
};
assert.deepEqual(await execute(graph), [1, 2, 3]);

// Reproduce the discarded-default failure that feeders fix: the same cached
// values in a property vanish when a live connection feeds that handle.
const broken = {
  nodes: graph.nodes.filter((node) => node.type !== "nodetool.input.ValueInput").map((node) => (
    node.id === "target" ? { ...node, properties: { input: [1, 2] } } : node
  )),
  edges: graph.edges.filter((edge) => edge.source === "live")
};
assert.equal(await execute(broken), 3);
console.log("Native plan executes cached [1,2] plus live 3 as [1,2,3], without executing the cached generator. Property-only baseline loses [1,2].");
