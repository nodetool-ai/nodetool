import { ManualTriggerNode, IntervalTriggerNode, WebhookTriggerNode, FileWatchTriggerNode } from "@nodetool-ai/automation-nodes/nodes/triggers";
const cases = [
  [ManualTriggerNode, { name: "manual" }, { data: { value: 7 }, timestamp: "2026-01-02T03:04:05.000Z", source: "fixture" }],
  [IntervalTriggerNode, { interval_seconds: 3 }, { tick: 4, elapsed_seconds: 12, interval_seconds: 3, timestamp: "2026-01-02T03:04:05.000Z" }],
  [WebhookTriggerNode, {}, { body: { value: 9 }, method: "PATCH", path: "/fixture", headers: { accept: "application/json" }, query: { q: "value" }, timestamp: "2026-01-02T03:04:05.000Z" }],
  [FileWatchTriggerNode, {}, { path: "/virtual/fixture.txt", event: "change", timestamp: "2026-01-02T03:04:05.000Z" }]
];
const results = [];
for (const [Node, properties, payload] of cases) {
  const outputs = [];
  const node = new Node(properties);
  await node.toExecutor().emitTriggerEvent({ node_id: "trigger", payload }, { async emit(slot,value) { outputs.push([slot,value]); } });
  results.push({ type: Node.nodeType, outputs });
}
globalThis.G6_RESULTS = JSON.stringify(results);
globalThis.__nodetool = {};
