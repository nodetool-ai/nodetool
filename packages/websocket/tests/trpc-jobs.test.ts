import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// Mock @nodetool/models — router orchestrates Job static + instance methods.
vi.mock("@nodetool/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool/models")>();
  return {
    ...actual,
    Job: {
      ...actual.Job,
      get: vi.fn(),
      paginate: vi.fn()
    }
  };
});

import { Job } from "@nodetool/models";

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

/**
 * Build a Job stub with the fields the router reads + mutates. `markCancelled`
 * is an instance method on the real model; we stub it inline.
 */
function makeJob(opts: {
  id?: string;
  user_id?: string;
  workflow_id?: string;
  status?: string;
  started_at?: string | null;
  finished_at?: string | null;
  error?: string | null;
}) {
  return {
    id: opts.id ?? "job-1",
    user_id: opts.user_id ?? "user-1",
    workflow_id: opts.workflow_id ?? "wf-1",
    status: opts.status ?? "running",
    started_at: opts.started_at ?? null,
    finished_at: opts.finished_at ?? null,
    error: opts.error ?? null,
    markCancelled: vi.fn(function (this: { status: string }) {
      this.status = "cancelled";
    }),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined)
  };
}

describe("jobs router", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── list ────────────────────────────────────────────────────────
  describe("list", () => {
    it("returns paginated jobs with next_start_key", async () => {
      const j1 = makeJob({ id: "j1", status: "completed" });
      const j2 = makeJob({ id: "j2", status: "running" });
      (Job.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [j1, j2],
        "next-cursor"
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.jobs.list({ limit: 50 });
      expect(result.jobs).toHaveLength(2);
      expect(result.jobs[0]).toMatchObject({
        id: "j1",
        user_id: "user-1",
        job_type: "workflow",
        status: "completed",
        cost: null
      });
      expect(result.next_start_key).toBe("next-cursor");
      expect(Job.paginate).toHaveBeenCalledWith("user-1", {
        limit: 50,
        workflowId: undefined
      });
    });

    it("coerces empty cursor to null", async () => {
      (Job.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([[], ""]);

      const caller = createCaller(makeCtx());
      const result = await caller.jobs.list({});
      expect(result.next_start_key).toBeNull();
    });

    it("defaults limit to 100", async () => {
      (Job.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([[], ""]);

      const caller = createCaller(makeCtx());
      await caller.jobs.list({});
      expect(Job.paginate).toHaveBeenCalledWith("user-1", {
        limit: 100,
        workflowId: undefined
      });
    });

    it("forwards workflow_id filter", async () => {
      (Job.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([[], ""]);

      const caller = createCaller(makeCtx());
      await caller.jobs.list({ workflow_id: "wf-42" });
      expect(Job.paginate).toHaveBeenCalledWith("user-1", {
        limit: 100,
        workflowId: "wf-42"
      });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.jobs.list({})).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── runningAll ──────────────────────────────────────────────────
  describe("runningAll", () => {
    it("returns only running or scheduled jobs", async () => {
      const jobs = [
        makeJob({ id: "j1", status: "running" }),
        makeJob({ id: "j2", status: "completed" }),
        makeJob({ id: "j3", status: "scheduled" }),
        makeJob({ id: "j4", status: "failed" })
      ];
      (Job.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([jobs, ""]);

      const caller = createCaller(makeCtx());
      const result = await caller.jobs.runningAll();
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.job_id)).toEqual(["j1", "j3"]);
      expect(result[0]?.is_running).toBe(true);
      expect(result[0]?.is_completed).toBe(false);
    });

    it("is called with limit 500 (matches legacy)", async () => {
      (Job.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([[], ""]);

      const caller = createCaller(makeCtx());
      await caller.jobs.runningAll();
      expect(Job.paginate).toHaveBeenCalledWith("user-1", { limit: 500 });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.jobs.runningAll()).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── get ─────────────────────────────────────────────────────────
  describe("get", () => {
    it("returns a job owned by the user", async () => {
      const j = makeJob({ id: "j1", user_id: "user-1", status: "completed" });
      (Job.get as ReturnType<typeof vi.fn>).mockResolvedValue(j);

      const caller = createCaller(makeCtx());
      const result = await caller.jobs.get({ id: "j1" });
      expect(result.id).toBe("j1");
      expect(result.status).toBe("completed");
    });

    it("throws NOT_FOUND when the job does not exist", async () => {
      (Job.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(caller.jobs.get({ id: "missing" })).rejects.toMatchObject({
        code: "NOT_FOUND"
      });
    });

    it("throws NOT_FOUND when the user does not own the job", async () => {
      const j = makeJob({ id: "j1", user_id: "other-user" });
      (Job.get as ReturnType<typeof vi.fn>).mockResolvedValue(j);

      const caller = createCaller(makeCtx());
      await expect(caller.jobs.get({ id: "j1" })).rejects.toMatchObject({
        code: "NOT_FOUND"
      });
    });
  });

  // ── delete ──────────────────────────────────────────────────────
  describe("delete", () => {
    it("deletes an owned job", async () => {
      const j = makeJob({ id: "j1", user_id: "user-1" });
      (Job.get as ReturnType<typeof vi.fn>).mockResolvedValue(j);

      const caller = createCaller(makeCtx());
      const result = await caller.jobs.delete({ id: "j1" });
      expect(j.delete).toHaveBeenCalled();
      expect(result).toEqual({ ok: true });
    });

    it("throws NOT_FOUND when the job does not exist", async () => {
      (Job.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.jobs.delete({ id: "missing" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws NOT_FOUND when the user does not own the job", async () => {
      const j = makeJob({ id: "j1", user_id: "other-user" });
      (Job.get as ReturnType<typeof vi.fn>).mockResolvedValue(j);

      const caller = createCaller(makeCtx());
      await expect(caller.jobs.delete({ id: "j1" })).rejects.toMatchObject({
        code: "NOT_FOUND"
      });
      expect(j.delete).not.toHaveBeenCalled();
    });
  });

  // ── cancel ──────────────────────────────────────────────────────
  describe("cancel", () => {
    it("marks the job cancelled, saves, and returns background shape", async () => {
      const j = makeJob({
        id: "j1",
        user_id: "user-1",
        status: "running",
        workflow_id: "wf-1",
        started_at: "2026-04-17T00:00:00Z"
      });
      (Job.get as ReturnType<typeof vi.fn>).mockResolvedValue(j);

      const caller = createCaller(makeCtx());
      const result = await caller.jobs.cancel({ id: "j1" });
      expect(j.markCancelled).toHaveBeenCalled();
      expect(j.save).toHaveBeenCalled();
      expect(result).toEqual({
        job_id: "j1",
        status: "cancelled",
        workflow_id: "wf-1",
        created_at: "2026-04-17T00:00:00Z",
        is_running: false,
        is_completed: true // "cancelled" maps to is_completed
      });
    });

    it("throws NOT_FOUND when the job does not exist", async () => {
      (Job.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.jobs.cancel({ id: "missing" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws NOT_FOUND when the user does not own the job", async () => {
      const j = makeJob({ id: "j1", user_id: "other-user" });
      (Job.get as ReturnType<typeof vi.fn>).mockResolvedValue(j);

      const caller = createCaller(makeCtx());
      await expect(caller.jobs.cancel({ id: "j1" })).rejects.toMatchObject({
        code: "NOT_FOUND"
      });
      expect(j.markCancelled).not.toHaveBeenCalled();
    });
  });
});
