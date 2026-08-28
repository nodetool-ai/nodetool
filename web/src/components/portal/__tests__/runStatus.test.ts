import type { Job } from "../../../stores/ApiTypes";
import { shortAgo, toneFor } from "../runStatus";

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
