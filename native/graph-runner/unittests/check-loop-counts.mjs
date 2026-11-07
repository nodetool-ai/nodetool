import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const [runner, bundle] = process.argv.slice(2);
for (const [fixture, expected] of [["loop-feedback", { loop: 3 }], ["loop-nested", { outer: 3, inner: 6 }]]) {
  const run = spawnSync(runner, ["run", "--bundle", bundle, "--graph", `native/graph-runner/tests/graphs/${fixture}.json`, "--job-summary"], { encoding: "utf8", timeout: 15000 });
  assert.equal(run.status, 0, run.stderr);
  const messages = run.stdout.split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
  for (const [node, count] of Object.entries(expected)) {
    const edges = messages.filter((m) => m.type === "edge_update" && m.edge_id === (node === "loop" ? "body-in" : node === "outer" ? "initial" : "body-in"));
    const outputs = messages.filter((m) => m.type === "output_update" && m.node_id === node && m.output_name === "index");
    // Edge counters count every routed value even when node updates are throttled.
    const counters = edges.map((m) => m.counter);
    assert.equal(Math.max(...counters), count, `${fixture} ${node} routed iterations`);
    assert.equal(outputs.length, count, `${fixture} ${node} index updates`);
    assert.deepEqual(outputs.map((m) => m.value), node === "inner" ? [0, 1, 0, 1, 0, 1] : [0, 1, 2]);
    console.log(`${fixture} ${node}: ${count} iterations, exact indices and edge counter`);
  }
  assert.equal(messages.filter((m) => m.type === "job_update" && m.status === "completed" && !m.result).length, 1);
  assert.deepEqual(messages.at(-1).result.outputs, { Output: [7] });
}
