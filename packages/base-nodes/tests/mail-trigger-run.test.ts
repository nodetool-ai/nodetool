/**
 * Runs `lib.mail.EmailTrigger` the way the trigger dispatcher does: a run that
 * carries a delivered event for the trigger node.
 *
 * `emitTriggerEvent` is only called for a node the executor knows is a trigger,
 * and a saved graph never carries that flag, so a structural check cannot show
 * that the mail reaches the graph. Every assertion is on the value that comes
 * out. The payload is the shape the node's own poller produces, so the poller
 * and the entry point cannot drift apart.
 */
import { describe, expect, it } from "vitest";
import { NodeRegistry, createGraphNodeTypeResolver } from "@nodetool-ai/node-sdk";
import { ExecutionSession } from "@nodetool-ai/execution";
import { registerBaseNodes } from "../src/index.js";

const GRAPH = {
  nodes: [
    { id: "mail", type: "lib.mail.EmailTrigger" },
    { id: "subject", type: "nodetool.output.Output", name: "subject", data: { name: "subject" } },
    { id: "body", type: "nodetool.output.Output", name: "body", data: { name: "body" } },
    { id: "sender", type: "nodetool.output.Output", name: "sender", data: { name: "sender" } }
  ],
  edges: ["subject", "body", "sender"].map((slot, i) => ({
    id: `e${i}`,
    source: "mail",
    sourceHandle: slot,
    target: slot,
    targetHandle: "value"
  }))
};

async function run(payload: unknown): Promise<Record<string, unknown[]>> {
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  const session = await ExecutionSession.create({
    graph: GRAPH,
    registry,
    resolveNodeType: createGraphNodeTypeResolver(registry).resolveNodeType,
    jobId: "mail-trigger-run",
    params: {},
    triggerEvent: { node_id: "mail", payload, input_id: "test" }
  } as never);
  const result = await session.result;
  expect(result.error ?? null).toBeNull();
  expect(result.status).toBe("completed");
  return (result.outputs ?? {}) as Record<string, unknown[]>;
}

describe("lib.mail.EmailTrigger on a delivered event", () => {
  it("hands the message's subject, sender and body to the graph", async () => {
    const outputs = await run({
      source: "email",
      event_type: "new_mail",
      email: {
        subject: "Invoice 42",
        from: "alice@example.com",
        to: "me@gmail.com",
        date: "2026-01-01T00:00:00.000Z",
        message_id: "<a@example.com>",
        body: "Please pay by Friday"
      }
    });
    expect(outputs["subject"]).toEqual(["Invoice 42"]);
    expect(outputs["sender"]).toEqual(["alice@example.com"]);
    expect(outputs["body"]).toEqual(["Please pay by Friday"]);
  });

  it("emits nothing for a bare schedule tick, which carries no mail", async () => {
    const outputs = await run({ tick: 3, source: "schedule", event_type: "tick" });
    expect(outputs["subject"] ?? []).toEqual([]);
    expect(outputs["body"] ?? []).toEqual([]);
  });
});
