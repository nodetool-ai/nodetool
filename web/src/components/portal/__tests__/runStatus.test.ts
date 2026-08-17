import type { Job } from "../../../stores/ApiTypes";
import { lastRunByWorkflow, shortAgo, toneFor } from "../runStatus";

const job = (overrides: Partial<Job>): Job => ({
  id: "job-1",
  user_id: "user-1",
  job_type: "workflow",
  status: "completed",
  name: null,
  workflow_id: "wf-1",
  started_at: "2026-08-16T10:00:00.000Z",
  finished_at: "2026-08-16T10:01:00.000Z",
  error: null,
  cost: null,
  ...overrides
});

const ago = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString();

describe("toneFor", () => {
  it("reads in-flight statuses as running", () => {
    for (const status of ["running", "starting", "queued", "pending"]) {
      expect(toneFor(status)).toBe("running");
    }
  });

  it("reads failures and cancellations as failed", () => {
    for (const status of ["failed", "error", "cancelled"]) {
      expect(toneFor(status)).toBe("failed");
    }
  });

  it("treats anything else as done, ignoring case", () => {
    expect(toneFor("completed")).toBe("done");
    expect(toneFor("COMPLETED")).toBe("done");
    expect(toneFor("RUNNING")).toBe("running");
  });
});

describe("shortAgo", () => {
  it("returns nothing for a missing or unparseable timestamp", () => {
    expect(shortAgo(null)).toBe("");
    expect(shortAgo(undefined)).toBe("");
    expect(shortAgo("not a date")).toBe("");
  });

  it("steps through minutes, hours and days", () => {
    expect(shortAgo(ago(0))).toBe("now");
    expect(shortAgo(ago(12))).toBe("12m");
    expect(shortAgo(ago(180))).toBe("3h");
    expect(shortAgo(ago(60 * 24 * 5))).toBe("5d");
  });
});

describe("lastRunByWorkflow", () => {
  it("returns an empty map when there are no jobs", () => {
    expect(lastRunByWorkflow(undefined).size).toBe(0);
    expect(lastRunByWorkflow([]).size).toBe(0);
  });

  it("keeps the most recent run per workflow", () => {
    const runs = lastRunByWorkflow([
      job({ id: "a", workflow_id: "wf-1", started_at: ago(300), finished_at: ago(300) }),
      job({ id: "b", workflow_id: "wf-1", started_at: ago(12), finished_at: ago(12) }),
      job({ id: "c", workflow_id: "wf-2", started_at: ago(60), finished_at: ago(60) })
    ]);
    expect(runs.get("wf-1")).toEqual({ tone: "done", label: "ran 12m ago" });
    expect(runs.get("wf-2")).toEqual({ tone: "done", label: "ran 1h ago" });
  });

  // Both orderings, because the running job winning is handled by a different
  // branch depending on whether it is seen before or after the settled one.
  it.each([
    ["running job first", ["running", "completed"]],
    ["running job second", ["completed", "running"]]
  ])("prefers a running job over a newer settled one (%s)", (_label, order) => {
    const [first, second] = order;
    const runs = lastRunByWorkflow([
      job({
        id: "a",
        status: first,
        started_at: first === "running" ? ago(30) : ago(2),
        finished_at: first === "running" ? null : ago(1)
      }),
      job({
        id: "b",
        status: second,
        started_at: second === "running" ? ago(30) : ago(2),
        finished_at: second === "running" ? null : ago(1)
      })
    ]);
    expect(runs.get("wf-1")).toEqual({ tone: "running", label: "running" });
  });

  it("labels a failure as failed", () => {
    const runs = lastRunByWorkflow([
      job({ status: "failed", started_at: ago(120), finished_at: ago(119) })
    ]);
    expect(runs.get("wf-1")).toEqual({ tone: "failed", label: "failed 1h ago" });
  });

  it("says 'just now' rather than 'now ago' for a fresh run", () => {
    const runs = lastRunByWorkflow([
      job({ status: "completed", started_at: ago(0), finished_at: ago(0) })
    ]);
    expect(runs.get("wf-1")).toEqual({ tone: "done", label: "ran just now" });
  });

  it("still labels a run whose timestamps are missing", () => {
    const runs = lastRunByWorkflow([
      job({ status: "completed", started_at: null, finished_at: null })
    ]);
    expect(runs.get("wf-1")).toEqual({ tone: "done", label: "ran" });
  });
});
