/**
 * handleWorkflowMessage's job interaction through the ChatJobAccess seam.
 *
 * The contract under test: a chat-driven workflow run registers against the
 * connection's concurrency slots, drops without draining on the superseded
 * early return, and always releases (delete + drain) in the `finally` — a
 * missed release permanently shrinks the connection's job cap.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { initTestDb, Job, Message, Workflow } from "@nodetool-ai/models";
import {
  makeChatTurnHarness,
  fakeProvider
} from "./chat-turn-test-harness.js";

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

/** A one-node graph whose executor echoes its `value` property. */
const echoGraph = {
  nodes: [{ id: "n1", type: "test.Echo", data: { value: "hello" } }],
  edges: []
};

interface EchoExecutorControls {
  /** Resolves once the node's process() has been entered. */
  started: Promise<void>;
  /** Release a gated node. */
  release: () => void;
}

function makeExecutors(behavior: "echo" | "throw" | "gated"): {
  resolveExecutor: (node: {
    id: string;
    type: string;
    [key: string]: unknown;
  }) => { process: (inputs: Record<string, unknown>) => Promise<unknown> };
  controls: EchoExecutorControls;
} {
  let started!: () => void;
  const startedPromise = new Promise<void>((r) => {
    started = r;
  });
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  return {
    resolveExecutor: (node) => ({
      async process() {
        started();
        if (behavior === "throw") throw new Error("node exploded");
        if (behavior === "gated") {
          // A safety valve so a broken cancellation cannot hang the suite.
          await Promise.race([gate, new Promise((r) => setTimeout(r, 8000))]);
        }
        const props =
          typeof node.properties === "object" && node.properties !== null
            ? (node.properties as Record<string, unknown>)
            : {};
        return { output: props.value ?? "" };
      }
    }),
    controls: { started: startedPromise, release }
  };
}

async function seedWorkflow(id: string): Promise<void> {
  await Workflow.create({
    id,
    user_id: "1",
    name: "wf",
    graph: echoGraph,
    access: "private"
  });
}

function workflowTurnData(
  threadId: string,
  workflowId: string | null
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    thread_id: threadId,
    content: "run it",
    workflow_target: "workflow",
    provider: "mock",
    model: "m"
  };
  if (workflowId) data.workflow_id = workflowId;
  return data;
}

describe("handleWorkflowMessage job accounting", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("registers, streams, and releases on a completed run", async () => {
    const { resolveExecutor } = makeExecutors("echo");
    const { handler, session, jobs } = makeChatTurnHarness({
      session: {
        resolveExecutor,
        resolveProvider: async () => fakeProvider({})
      }
    });
    await seedWorkflow("wf-ok");

    await handler.handleChatMessage(workflowTurnData("t-wf-ok", "wf-ok"));

    expect(jobs.ops()).toEqual(["register", "release"]);
    const jobId = jobs.calls[0].jobId;
    expect(jobs.calls[1].jobId).toBe(jobId);
    // The slot is empty afterwards.
    expect(jobs.active.size).toBe(0);

    const updates = session.messagesOfType("job_update");
    expect(updates[0].status).toBe("running");
    expect(updates[updates.length - 1].status).toBe("completed");
    // Completion chunk carries the job id.
    const done = session
      .messagesOfType("chunk")
      .find((c) => c.done === true);
    expect(done?.job_id).toBe(jobId);
    // The turn ends with a persisted assistant response.
    const finalMsg = session
      .messagesOfType("message")
      .find((m) => m.role === "assistant");
    expect(finalMsg).toBeDefined();
    const job = await Job.get(jobId);
    expect(job?.status).toBe("completed");
  });

  it("releases the slot and reports failure when a node throws", async () => {
    const { resolveExecutor } = makeExecutors("throw");
    const { handler, session, jobs } = makeChatTurnHarness({
      session: {
        resolveExecutor,
        resolveProvider: async () => fakeProvider({})
      }
    });
    await seedWorkflow("wf-boom");

    await handler.handleChatMessage(workflowTurnData("t-wf-boom", "wf-boom"));

    expect(jobs.ops()).toEqual(["register", "release"]);
    const updates = session.messagesOfType("job_update");
    expect(updates[updates.length - 1].status).toBe("failed");
    const job = await Job.get(jobs.calls[0].jobId);
    expect(job?.status).toBe("failed");
    expect(job?.error).toContain("node exploded");
  });

  it("releases even when the workflow does not exist, without registering", async () => {
    const { handler, session, jobs } = makeChatTurnHarness({
      session: {
        resolveExecutor: () => ({
          async process() {
            return {};
          }
        }),
        resolveProvider: async () => fakeProvider({})
      }
    });

    await handler.handleChatMessage(workflowTurnData("t-wf-miss", "wf-nope"));

    // No register — the run never started — but the finally still releases.
    expect(jobs.ops()).toEqual(["release"]);
    const [err] = session.messagesOfType("error");
    expect(String(err.message)).toContain("Workflow wf-nope not found");
    // Done chunk still arrives so the client stops spinning.
    expect(
      session.messagesOfType("chunk").some((c) => c.done === true)
    ).toBe(true);
  });

  it("refuses a workflow turn with no workflow_id", async () => {
    const { handler, session, jobs } = makeChatTurnHarness({
      session: {
        resolveExecutor: () => ({
          async process() {
            return {};
          }
        }),
        resolveProvider: async () => fakeProvider({})
      }
    });

    await handler.handleChatMessage(workflowTurnData("t-wf-noid", null));

    expect(jobs.ops()).toEqual(["release"]);
    const [err] = session.messagesOfType("error");
    expect(String(err.message)).toContain("workflow_id is required");
  });

  it("drops and releases a run superseded mid-flight, and stops streaming", async () => {
    const { resolveExecutor, controls } = makeExecutors("gated");
    const { handler, session, jobs } = makeChatTurnHarness({
      session: {
        resolveExecutor,
        resolveProvider: async () => fakeProvider({})
      }
    });
    await seedWorkflow("wf-super");

    const turn = handler.beginTurn();
    const running = handler.handleChatMessage(
      workflowTurnData("t-wf-super", "wf-super"),
      turn.seq,
      turn.signal
    );
    await controls.started;

    // A new message supersedes the turn: seq moves on and the old signal fires.
    handler.beginTurn();
    controls.release();
    await running;

    expect(jobs.ops()).toEqual(["register", "drop", "release"]);
    const jobId = jobs.calls[0].jobId;
    // The superseded return path: no terminal job_update, no done chunk, no
    // assistant response — the user has moved on.
    const updates = session.messagesOfType("job_update");
    expect(updates.filter((u) => u.status === "completed")).toHaveLength(0);
    expect(
      session.messagesOfType("chunk").filter((c) => c.done === true)
    ).toHaveLength(0);
    expect(
      session
        .messagesOfType("message")
        .filter((m) => m.role === "assistant")
    ).toHaveLength(0);
    const job = await Job.get(jobId);
    expect(job?.status).toBe("cancelled");
  });

  it("cancels the run when the turn signal is already aborted", async () => {
    const { resolveExecutor, controls } = makeExecutors("gated");
    const { handler, session, jobs } = makeChatTurnHarness({
      session: {
        resolveExecutor,
        resolveProvider: async () => fakeProvider({})
      }
    });
    await seedWorkflow("wf-aborted");

    const controller = new AbortController();
    controller.abort();
    const running = handler.handleChatMessage(
      workflowTurnData("t-wf-aborted", "wf-aborted"),
      undefined,
      controller.signal
    );
    controls.release();
    await running;

    // The seq still matches (undefined), so the run tears down through the
    // normal path with a cancelled status rather than the superseded return.
    expect(jobs.ops()).toEqual(["register", "release"]);
    await vi.waitFor(async () => {
      const job = await Job.get(jobs.calls[0].jobId);
      expect(job?.status).toBe("cancelled");
    });
    const updates = session.messagesOfType("job_update");
    expect(updates[updates.length - 1].status).toBe("cancelled");
  });

  it("keeps the user message persisted before routing to the workflow", async () => {
    const { resolveExecutor } = makeExecutors("echo");
    const { handler } = makeChatTurnHarness({
      session: {
        resolveExecutor,
        resolveProvider: async () => fakeProvider({})
      }
    });
    await seedWorkflow("wf-persist");
    await handler.handleChatMessage(
      workflowTurnData("t-wf-persist", "wf-persist")
    );
    const [rows] = await Message.paginate("t-wf-persist", { limit: 10 });
    expect(rows.some((m) => m.role === "user")).toBe(true);
    expect(rows.some((m) => m.role === "assistant")).toBe(true);
  });
});
