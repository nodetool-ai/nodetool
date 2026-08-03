/**
 * Interactive escalations over the HTTP debug surface: a failing node parks
 * the run and the response hands the escalation to the caller, who answers
 * with a verdict on the session endpoint — the calling agent standing where
 * the LLM supervisor otherwise would. Covers the loop end to end plus the
 * guardrails: disallowed verdicts are rejected without killing the node, and
 * sessions are invisible to other users.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import os from "node:os";
import { initTestDb, Workflow } from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { Escalation } from "@nodetool-ai/protocol";

vi.mock("../src/lib/workflow-workspace.js", async () => {
  const actual = await vi.importActual<
    typeof import("../src/lib/workflow-workspace.js")
  >("../src/lib/workflow-workspace.js");
  return {
    ...actual,
    resolveWorkflowWorkspace: async () => os.tmpdir()
  };
});

const { handleWorkflowRun, handleDebugSessionRequest } = await import(
  "../src/http-api.js"
);

let failCount = 0;

const failExecutor = {
  async process(): Promise<Record<string, unknown>> {
    failCount++;
    throw new Error("boom 42");
  }
};

const echoExecutor = {
  async process(
    ins: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return ins;
  }
};

// The handler asks the registry for executors and (via hydrateGraphNodeFlags)
// for classes/metadata; an unknown type just defaults every flag to false.
const registry = {
  has: (t: string) => t === "test.Fail" || t === "nodetool.output.Output",
  resolve: (node: { type: string }) =>
    node.type === "test.Fail" ? failExecutor : echoExecutor,
  getClass: () => undefined,
  resolveMetadata: () => undefined,
  getMetadata: () => undefined,
  listMetadata: () => []
} as unknown as NodeRegistry;

async function createFailingWorkflow(): Promise<Workflow> {
  return (await Workflow.create({
    user_id: "user-1",
    name: "Failing WF",
    access: "private",
    graph: {
      nodes: [
        { id: "work", type: "test.Fail", properties: {} },
        {
          id: "out",
          type: "nodetool.output.Output",
          name: "result",
          properties: {}
        }
      ],
      edges: [
        {
          source: "work",
          sourceHandle: "value",
          target: "out",
          targetHandle: "value"
        }
      ]
    }
  })) as Workflow;
}

function debugRequest(body: Record<string, unknown>, userId = "user-1") {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "x-user-id": userId, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function verdictRequest(
  escalationId: string,
  verdict: Record<string, unknown>,
  userId = "user-1"
) {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "x-user-id": userId, "content-type": "application/json" },
    body: JSON.stringify({ escalation_id: escalationId, verdict })
  });
}

async function startInteractiveDebug(): Promise<{
  sessionId: string;
  escalationId: string;
  escalation: Escalation;
}> {
  const workflow = await createFailingWorkflow();
  const res = await handleWorkflowRun(
    debugRequest({ interactive: true }),
    workflow.id,
    { registry },
    true
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.status).toBe("escalated");
  expect(typeof body.session_id).toBe("string");
  expect(typeof body.escalation_id).toBe("string");
  return {
    sessionId: body.session_id as string,
    escalationId: body.escalation_id as string,
    escalation: body.escalation as Escalation
  };
}

beforeEach(async () => {
  await initTestDb();
  failCount = 0;
});

describe("interactive debug runs", () => {
  it("bubbles the escalation up and resumes on a skip verdict", async () => {
    const { sessionId, escalationId, escalation } =
      await startInteractiveDebug();

    // The escalation is the supervisor record, redacted and typed.
    expect(escalation.nodeId).toBe("work");
    expect(escalation.detail).toContain("boom 42");
    // Not retry-safe (no opt-in), no candidate output — skip/fail only.
    expect(escalation.allowedActions).toEqual(["skip", "fail"]);

    const res = await handleDebugSessionRequest(
      verdictRequest(escalationId, { action: "skip" }),
      sessionId,
      "verdict",
      { registry }
    );
    expect(res.status).toBe(200);
    const report = (await res.json()) as Record<string, unknown>;
    expect(report.status).toBe("completed");
    const summary = report.summary as { interventions: unknown[] };
    expect(summary.interventions).toHaveLength(1);
    const verdict = report.verdict as { ok: boolean };
    expect(verdict.ok).toBe(true);
  });

  it("rejects a disallowed verdict without deciding the escalation", async () => {
    const { sessionId, escalationId } = await startInteractiveDebug();

    // retry is not in allowedActions (the node never opted into retry_safe).
    const rejected = await handleDebugSessionRequest(
      verdictRequest(escalationId, { action: "retry" }),
      sessionId,
      "verdict",
      { registry }
    );
    expect(rejected.status).toBe(400);
    expect(await rejected.text()).toContain("not allowed");

    // A malformed verdict is rejected by schema, same non-terminal way.
    const malformed = await handleDebugSessionRequest(
      verdictRequest(escalationId, { action: "explode" }),
      sessionId,
      "verdict",
      { registry }
    );
    expect(malformed.status).toBe(400);

    // The escalation is still pending — GET shows it, and a legal verdict
    // still lands.
    const peek = await handleDebugSessionRequest(
      new Request("http://localhost/x", { headers: { "x-user-id": "user-1" } }),
      sessionId,
      null,
      { registry }
    );
    const peeked = (await peek.json()) as Record<string, unknown>;
    expect(peeked.status).toBe("escalated");
    expect(peeked.escalation_id).toBe(escalationId);

    const res = await handleDebugSessionRequest(
      verdictRequest(escalationId, {
        action: "fail",
        reason: "not recoverable"
      }),
      sessionId,
      "verdict",
      { registry }
    );
    const report = (await res.json()) as Record<string, unknown>;
    expect(report.status).toBe("failed");
    expect(failCount).toBe(1);
  });

  it("hides sessions from other users", async () => {
    const { sessionId, escalationId } = await startInteractiveDebug();

    const foreign = await handleDebugSessionRequest(
      verdictRequest(escalationId, { action: "skip" }, "someone-else"),
      sessionId,
      "verdict",
      { registry }
    );
    expect(foreign.status).toBe(404);

    const missing = await handleDebugSessionRequest(
      verdictRequest(escalationId, { action: "skip" }),
      "no-such-session",
      "verdict",
      { registry }
    );
    expect(missing.status).toBe(404);

    // Clean up: settle the parked run so the test file exits promptly.
    await handleDebugSessionRequest(
      verdictRequest(escalationId, { action: "skip" }),
      sessionId,
      "verdict",
      { registry }
    );
  });
});
