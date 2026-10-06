import type { RunLog } from "@nodetool-ai/protocol";
import { replayAppRunActivity } from "../appRunActivity";

function event(id: string, source: string, name: string, attributes: Record<string, unknown>): RunLog {
  return { id, name, attributes: { "node.id": source, ...attributes }, span_id: source === "a" ? "a".repeat(16) : "b".repeat(16),
    span_name: "agent.loop", time_ms: 1, level: "info", source: "agent" };
}
it("deduplicates pages while preserving concurrent agent text and colliding tool ids", () => {
  const call = { "tool.call_id": "same", "tool.name": "tool" };
  const text = event("1", "a", "agent.activity", { "log.message": "A" });
  const entries = replayAppRunActivity([text, event("2", "b", "agent.activity", { "log.message": "B" }), text,
    event("3", "a", "agent.activity", call), event("4", "b", "agent.activity", call),
    event("5", "a", "tool.result", { ...call, "tool.result": "done A" }),
    event("6", "a", "agent.activity", call)]);
  expect(entries.map((item) => item.entry)).toEqual([
    { kind: "text", text: "A", source: "a" }, { kind: "text", text: "B", source: "b" },
    { kind: "tool", id: "a:same", name: "tool", label: "tool", source: "a", status: "done", result: "done A" },
    { kind: "tool", id: "b:same", name: "tool", label: "tool", source: "b", status: "running" }
  ]);
});
it("ignores content-free, non-agent and unrelated log events", () => {
  expect(replayAppRunActivity([event("1", "a", "agent.activity", {}), event("2", "a", "log", { "log.message": "other" }),
    { ...event("3", "a", "agent.activity", { "log.message": "other" }), source: "server" }])).toEqual([]);
});
it("keeps simultaneous reporters on the same node separate when provider tool IDs collide", () => {
  const call = { "tool.call_id": "same", "tool.name": "tool" };
  const entries = replayAppRunActivity([
    event("1", "a", "agent.activity", { ...call, "agent.activity_id": "reporter-a" }),
    event("2", "a", "agent.activity", { ...call, "agent.activity_id": "reporter-b" }),
    event("3", "a", "tool.result", { ...call, "agent.activity_id": "reporter-a", "tool.result": "result A" })
  ]);
  expect(entries.map((item) => item.entry)).toEqual([
    { kind: "tool", id: "reporter-a:same", source: "reporter-a", name: "tool", label: "tool", status: "done", result: "result A" },
    { kind: "tool", id: "reporter-b:same", source: "reporter-b", name: "tool", label: "tool", status: "running" }
  ]);
});
