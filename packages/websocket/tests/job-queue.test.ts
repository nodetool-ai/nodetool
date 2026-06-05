import { describe, it, expect } from "vitest";
import { JobConcurrencyQueue } from "../src/job-queue.js";

const req = (jobId: string, workflowId: string | null = "wf") => ({
  job_id: jobId,
  workflow_id: workflowId
});

describe("JobConcurrencyQueue", () => {
  it("enqueues FIFO and reports 1-based positions", () => {
    const q = new JobConcurrencyQueue();
    expect(q.enqueue(req("a"))).toBe(1);
    expect(q.enqueue(req("b"))).toBe(2);
    expect(q.enqueue(req("c"))).toBe(3);
    expect(q.size).toBe(3);
    expect(q.positions()).toEqual([
      { jobId: "a", workflowId: "wf", position: 1, concurrent: false },
      { jobId: "b", workflowId: "wf", position: 2, concurrent: false },
      { jobId: "c", workflowId: "wf", position: 3, concurrent: false }
    ]);
  });

  it("dequeues in insertion order and shrinks", () => {
    const q = new JobConcurrencyQueue();
    q.enqueue(req("a"));
    q.enqueue(req("b"));
    expect(q.dequeue()?.job_id).toBe("a");
    expect(q.dequeue()?.job_id).toBe("b");
    expect(q.dequeue()).toBeUndefined();
    expect(q.size).toBe(0);
  });

  it("removes a queued job by id and recomputes positions", () => {
    const q = new JobConcurrencyQueue();
    q.enqueue(req("a"));
    q.enqueue(req("b"));
    q.enqueue(req("c"));
    const removed = q.remove("b");
    expect(removed?.job_id).toBe("b");
    expect(q.positions()).toEqual([
      { jobId: "a", workflowId: "wf", position: 1, concurrent: false },
      { jobId: "c", workflowId: "wf", position: 2, concurrent: false }
    ]);
  });

  it("returns undefined when removing an unknown/already-started job", () => {
    const q = new JobConcurrencyQueue();
    q.enqueue(req("a"));
    expect(q.remove("missing")).toBeUndefined();
    expect(q.size).toBe(1);
  });

  it("preserves a null workflowId in positions", () => {
    const q = new JobConcurrencyQueue();
    q.enqueue(req("a", null));
    expect(q.positions()).toEqual([
      { jobId: "a", workflowId: null, position: 1, concurrent: false }
    ]);
  });
});

describe("JobConcurrencyQueue concurrent flag", () => {
  it("surfaces the concurrent flag in positions()", () => {
    const q = new JobConcurrencyQueue();
    q.enqueue({ job_id: "a", workflow_id: "wf", concurrent: true });
    q.enqueue({ job_id: "b", workflow_id: "wf" });
    const pos = q.positions();
    expect(pos.find((p) => p.jobId === "a")?.concurrent).toBe(true);
    expect(pos.find((p) => p.jobId === "b")?.concurrent).toBe(false);
  });
});
