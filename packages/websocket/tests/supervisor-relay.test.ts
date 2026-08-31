/**
 * `supervisor_*` relay.
 *
 * The kernel emits `supervisor_escalation` / `supervisor_decision` on the run's
 * context; the client's intervention feed only exists if the websocket runner
 * relays them. A node posts both messages here — no model, no escalation — so
 * what is under test is the relay itself: neither type may be dropped, and both
 * carry the run's `job_id` / `workflow_id`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { unpack } from "msgpackr";
import { initTestDb } from "@nodetool-ai/models";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { Escalation } from "@nodetool-ai/protocol";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";

class MockWS implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  queue: Array<WebSocketReceiveFrame> = [];
  async accept() {}
  async receive(): Promise<WebSocketReceiveFrame> {
    return this.queue.shift() ?? { type: "websocket.disconnect" };
  }
  async sendBytes(data: Uint8Array) {
    this.sentBytes.push(data);
  }
  async sendText() {}
  async close() {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

const escalation: Escalation = {
  nodeId: "n1",
  nodeType: "test.Node",
  correlationLineage: [],
  invocationKey: "",
  allowedActions: ["skip", "fail"],
  detail: "boom",
  inputs: {},
  declaredOutputs: { output: "str" },
  attempt: 1,
  spentCostUsd: 0,
  createdAssets: false,
  retrySafe: false,
  emitted: false
};

let ws: MockWS;

beforeEach(async () => {
  await initTestDb();
  ws = new MockWS();
});

describe("supervisor message relay", () => {
  it("relays escalation and decision messages to the client", async () => {
    const runner = new WebSocketClientSession({
      resolveExecutor: () => ({
        async process(
          _inputs: Record<string, unknown>,
          context?: ProcessingContext
        ) {
          context?.postMessage({
            type: "supervisor_escalation",
            node_id: "n1",
            node_name: "Node",
            escalation
          });
          context?.postMessage({
            type: "supervisor_decision",
            node_id: "n1",
            node_name: "Node",
            escalation,
            verdict: { action: "skip" },
            decided_by: "agent",
            cost: 0.0002
          });
          return { output: "ok" };
        }
      })
    });

    await runner.connect(ws);
    await runner.runJob({
      job_id: "JOB1",
      workflow_id: "WF1",
      graph: { nodes: [{ id: "n1", type: "test.Node" }], edges: [] }
    });
    await new Promise((r) => setTimeout(r, 200));

    const sent = ws.sentBytes.map((b) => unpack(b) as Record<string, unknown>);
    const relayedEscalation = sent.find(
      (m) => m.type === "supervisor_escalation"
    );
    const relayedDecision = sent.find((m) => m.type === "supervisor_decision");

    expect(relayedEscalation).toBeDefined();
    expect(relayedEscalation?.job_id).toBe("JOB1");
    expect(relayedEscalation?.workflow_id).toBe("WF1");
    expect(relayedDecision).toBeDefined();
    expect(
      (relayedDecision?.verdict as { action: string } | undefined)?.action
    ).toBe("skip");
    expect(relayedDecision?.decided_by).toBe("agent");

    await runner.disconnect();
  });
});
