import { describe, it, expect } from "vitest";
import {
  jobResponse,
  backgroundJobResponse,
  listInput,
  listOutput,
  runningAllOutput,
  getInput,
  deleteInput,
  deleteOutput,
  cancelInput,
  cancelOutput
} from "../src/api-schemas/jobs.js";

const validJob = {
  id: "j1",
  user_id: "u1",
  job_type: "workflow" as const,
  status: "running",
  name: null,
  workflow_id: "w1",
  started_at: null,
  finished_at: null,
  error: null,
  cost: null
};

const validBg = {
  job_id: "j1",
  status: "running",
  workflow_id: "w1",
  created_at: null,
  is_running: true,
  is_completed: false
};

describe("jobs.jobResponse", () => {
  it("parses a valid job with nulls", () => {
    expect(jobResponse.safeParse(validJob).success).toBe(true);
  });

  it("parses populated nullable fields", () => {
    expect(
      jobResponse.safeParse({
        ...validJob,
        name: "My job",
        started_at: "2026-01-01",
        cost: 1.5
      }).success
    ).toBe(true);
  });

  it("rejects a job_type other than 'workflow'", () => {
    expect(
      jobResponse.safeParse({ ...validJob, job_type: "batch" }).success
    ).toBe(false);
  });
});

describe("jobs.backgroundJobResponse", () => {
  it("parses valid background job", () => {
    expect(backgroundJobResponse.safeParse(validBg).success).toBe(true);
  });

  it("rejects a non-boolean is_running", () => {
    expect(
      backgroundJobResponse.safeParse({ ...validBg, is_running: "yes" }).success
    ).toBe(false);
  });
});

describe("jobs.listInput", () => {
  it("defaults limit to 100", () => {
    expect(listInput.parse({}).limit).toBe(100);
  });

  it("accepts workflow_id filter", () => {
    expect(listInput.safeParse({ workflow_id: "w1", limit: 5 }).success).toBe(
      true
    );
  });

  it("rejects limit above 500", () => {
    expect(listInput.safeParse({ limit: 501 }).success).toBe(false);
  });

  it("rejects a non-integer limit", () => {
    expect(listInput.safeParse({ limit: 10.5 }).success).toBe(false);
  });

  it("rejects limit below 1", () => {
    expect(listInput.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe("jobs.listOutput", () => {
  it("parses jobs with a null next_start_key", () => {
    expect(
      listOutput.safeParse({ jobs: [validJob], next_start_key: null }).success
    ).toBe(true);
  });
});

describe("jobs.runningAllOutput", () => {
  it("parses an array of background jobs", () => {
    expect(runningAllOutput.safeParse([validBg]).success).toBe(true);
  });
});

describe("jobs.getInput / deleteInput / cancelInput", () => {
  it("accept a non-empty id", () => {
    expect(getInput.safeParse({ id: "x" }).success).toBe(true);
    expect(deleteInput.safeParse({ id: "x" }).success).toBe(true);
    expect(cancelInput.safeParse({ id: "x" }).success).toBe(true);
  });

  it("reject an empty id", () => {
    expect(getInput.safeParse({ id: "" }).success).toBe(false);
    expect(deleteInput.safeParse({ id: "" }).success).toBe(false);
    expect(cancelInput.safeParse({ id: "" }).success).toBe(false);
  });
});

describe("jobs.deleteOutput", () => {
  it("requires ok: true literal", () => {
    expect(deleteOutput.safeParse({ ok: true }).success).toBe(true);
    expect(deleteOutput.safeParse({ ok: false }).success).toBe(false);
  });
});

describe("jobs.cancelOutput", () => {
  it("mirrors backgroundJobResponse", () => {
    expect(cancelOutput.safeParse(validBg).success).toBe(true);
    expect(cancelOutput.safeParse({}).success).toBe(false);
  });
});
