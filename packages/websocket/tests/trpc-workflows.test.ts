import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// ── Mock @nodetool/models ────────────────────────────────────────────────────
vi.mock("@nodetool/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool/models")>();
  return {
    ...actual,
    Workflow: {
      ...actual.Workflow,
      get: vi.fn(),
      find: vi.fn(),
      paginate: vi.fn(),
      paginatePublic: vi.fn(),
      paginateTools: vi.fn(),
      create: vi.fn()
    },
    WorkflowVersion: {
      ...actual.WorkflowVersion,
      get: vi.fn(),
      create: vi.fn(),
      nextVersion: vi.fn(),
      listForWorkflow: vi.fn(),
      findByVersion: vi.fn(),
      pruneOldVersions: vi.fn()
    },
    Job: {
      ...actual.Job,
      create: vi.fn()
    }
  };
});

// ── Mock @nodetool/kernel ────────────────────────────────────────────────────
vi.mock("@nodetool/kernel", () => {
  return {
    WorkflowRunner: vi.fn()
  };
});

import { Workflow, WorkflowVersion, Job } from "@nodetool/models";
import { WorkflowRunner } from "@nodetool/kernel";

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {
      has: vi.fn().mockReturnValue(false),
      resolve: vi.fn(),
      getMetadata: vi.fn().mockReturnValue(null)
    } as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {
      hasNodeType: vi.fn().mockReturnValue(false),
      getNodeMetadata: vi.fn().mockReturnValue([]),
      ensureConnected: vi.fn().mockResolvedValue(undefined)
    } as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

function makeWorkflow(opts: {
  id?: string;
  user_id?: string;
  name?: string;
  access?: string;
  run_mode?: string;
  graph?: { nodes: unknown[]; edges: unknown[] };
}) {
  const wf = {
    id: opts.id ?? "wf-1",
    user_id: opts.user_id ?? "user-1",
    name: opts.name ?? "Test Workflow",
    access: opts.access ?? "private",
    run_mode: opts.run_mode ?? "workflow",
    tool_name: null,
    package_name: null,
    path: null,
    tags: [],
    description: "Test description",
    thumbnail: null,
    thumbnail_url: null,
    graph: opts.graph ?? { nodes: [], edges: [] },
    settings: null,
    workspace_id: null,
    html_app: null,
    created_at: "2026-04-17T00:00:00Z",
    updated_at: "2026-04-17T00:00:00Z",
    getEtag: vi.fn().mockReturnValue("etag-123"),
    getGraph: vi.fn().mockReturnValue(opts.graph ?? { nodes: [], edges: [] }),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined)
  };
  return wf;
}

function makeVersion(opts: {
  id?: string;
  workflow_id?: string;
  user_id?: string;
  version?: number;
  graph?: unknown;
}) {
  return {
    id: opts.id ?? "ver-1",
    workflow_id: opts.workflow_id ?? "wf-1",
    user_id: opts.user_id ?? "user-1",
    name: null,
    description: null,
    graph: opts.graph ?? { nodes: [], edges: [] },
    version: opts.version ?? 1,
    save_type: "manual",
    autosave_metadata: null,
    created_at: "2026-04-17T00:00:00Z",
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined)
  };
}

describe("workflows router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set WorkflowRunner constructor mock for each test.
    (WorkflowRunner as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      function () {
        return {
          run: vi.fn().mockResolvedValue({
            status: "completed",
            outputs: {},
            error: null,
            messages: []
          })
        };
      }
    );
  });

  // ── list ──────────────────────────────────────────────────────────────────
  describe("list", () => {
    it("returns paginated workflows", async () => {
      const wf = makeWorkflow({ id: "wf-1" });
      (Workflow.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [wf],
        "cursor-next"
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.list({ limit: 50 });
      expect(result.workflows).toHaveLength(1);
      expect(result.workflows[0]?.id).toBe("wf-1");
      expect(result.next).toBe("cursor-next");
    });

    it("coerces empty cursor to null", async () => {
      (Workflow.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [],
        ""
      ]);
      const caller = createCaller(makeCtx());
      const result = await caller.workflows.list({});
      expect(result.next).toBeNull();
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.workflows.list({})).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── names ─────────────────────────────────────────────────────────────────
  describe("names", () => {
    it("returns id→name map", async () => {
      const wf1 = makeWorkflow({ id: "wf-1", name: "Alpha" });
      const wf2 = makeWorkflow({ id: "wf-2", name: "Beta" });
      (Workflow.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [wf1, wf2],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.names();
      expect(result).toEqual({ "wf-1": "Alpha", "wf-2": "Beta" });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.workflows.names()).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── get ───────────────────────────────────────────────────────────────────
  describe("get", () => {
    it("returns an owned workflow", async () => {
      const wf = makeWorkflow({ id: "wf-1", user_id: "user-1" });
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.get({ id: "wf-1" });
      expect(result.id).toBe("wf-1");
      expect(result.name).toBe("Test Workflow");
    });

    it("returns a public workflow even when user doesn't own it", async () => {
      const wf = makeWorkflow({
        id: "wf-pub",
        user_id: "other-user",
        access: "public"
      });
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.get({ id: "wf-pub" });
      expect(result.id).toBe("wf-pub");
    });

    it("throws NOT_FOUND when workflow does not exist", async () => {
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(caller.workflows.get({ id: "missing" })).rejects.toMatchObject({
        code: "NOT_FOUND"
      });
    });

    it("throws NOT_FOUND when user doesn't own private workflow", async () => {
      const wf = makeWorkflow({
        id: "wf-1",
        user_id: "other-user",
        access: "private"
      });
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);

      const caller = createCaller(makeCtx());
      await expect(caller.workflows.get({ id: "wf-1" })).rejects.toMatchObject({
        code: "NOT_FOUND"
      });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.workflows.get({ id: "wf-1" })).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── create ────────────────────────────────────────────────────────────────
  describe("create", () => {
    it("creates a new workflow", async () => {
      const wf = makeWorkflow({ id: "wf-new" });
      (Workflow.create as ReturnType<typeof vi.fn>).mockResolvedValue(wf);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.create({
        name: "New Workflow",
        access: "private",
        graph: { nodes: [], edges: [] }
      });
      expect(result.id).toBe("wf-new");
      expect(Workflow.create).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: "user-1", name: "New Workflow" })
      );
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.workflows.create({
          name: "X",
          access: "private",
          graph: { nodes: [], edges: [] }
        })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ── update ────────────────────────────────────────────────────────────────
  describe("update", () => {
    it("updates an existing workflow", async () => {
      const wf = makeWorkflow({ id: "wf-1", user_id: "user-1" });
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.update({
        id: "wf-1",
        name: "Updated Name",
        access: "private",
        graph: { nodes: [], edges: [] }
      });
      expect(result.id).toBe("wf-1");
      expect(wf.save).toHaveBeenCalled();
    });

    it("throws NOT_FOUND when user doesn't own the workflow", async () => {
      const wf = makeWorkflow({ id: "wf-1", user_id: "other-user" });
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);

      const caller = createCaller(makeCtx());
      await expect(
        caller.workflows.update({
          id: "wf-1",
          name: "Updated",
          access: "private",
          graph: { nodes: [], edges: [] }
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("upserts when workflow does not exist", async () => {
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const wf = makeWorkflow({ id: "wf-new" });
      (Workflow.create as ReturnType<typeof vi.fn>).mockResolvedValue(wf);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.update({
        id: "wf-new",
        name: "New",
        access: "private",
        graph: { nodes: [], edges: [] }
      });
      expect(result.id).toBe("wf-new");
      expect(Workflow.create).toHaveBeenCalled();
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.workflows.update({
          id: "wf-1",
          name: "X",
          access: "private",
          graph: { nodes: [], edges: [] }
        })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────
  describe("delete", () => {
    it("deletes an owned workflow", async () => {
      const wf = makeWorkflow({ id: "wf-1", user_id: "user-1" });
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.delete({ id: "wf-1" });
      expect(result).toEqual({ ok: true });
      expect(wf.delete).toHaveBeenCalled();
    });

    it("throws NOT_FOUND when workflow does not exist", async () => {
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.workflows.delete({ id: "missing" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws NOT_FOUND when user doesn't own the workflow", async () => {
      const wf = makeWorkflow({ id: "wf-1", user_id: "other-user" });
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);

      const caller = createCaller(makeCtx());
      await expect(
        caller.workflows.delete({ id: "wf-1" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(wf.delete).not.toHaveBeenCalled();
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.workflows.delete({ id: "wf-1" })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ── run ───────────────────────────────────────────────────────────────────
  describe("run", () => {
    it("runs a workflow and returns job result", async () => {
      const wf = makeWorkflow({
        id: "wf-1",
        user_id: "user-1",
        run_mode: "workflow"
      });
      (Workflow.find as ReturnType<typeof vi.fn>).mockResolvedValue(wf);

      const job = {
        id: "job-1",
        markCompleted: vi.fn(),
        markFailed: vi.fn(),
        markCancelled: vi.fn(),
        save: vi.fn().mockResolvedValue(undefined)
      };
      (Job.create as ReturnType<typeof vi.fn>).mockResolvedValue(job);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.run({ id: "wf-1" });
      expect(result.job_id).toBe("job-1");
      expect(result.workflow_id).toBe("wf-1");
      expect(result.status).toBe("completed");
      expect(job.markCompleted).toHaveBeenCalled();
    });

    it("throws NOT_FOUND when workflow does not exist", async () => {
      (Workflow.find as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(caller.workflows.run({ id: "missing" })).rejects.toMatchObject({
        code: "NOT_FOUND"
      });
    });

    it("throws BAD_REQUEST for unsupported run mode", async () => {
      const wf = makeWorkflow({ id: "wf-1", run_mode: "chat" });
      (Workflow.find as ReturnType<typeof vi.fn>).mockResolvedValue(wf);

      const caller = createCaller(makeCtx());
      await expect(caller.workflows.run({ id: "wf-1" })).rejects.toMatchObject({
        code: "BAD_REQUEST"
      });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.workflows.run({ id: "wf-1" })).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── autosave ──────────────────────────────────────────────────────────────
  describe("autosave", () => {
    it("saves workflow and creates a version", async () => {
      const wf = makeWorkflow({ id: "wf-1", user_id: "user-1" });
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);
      (WorkflowVersion.nextVersion as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      const ver = makeVersion({ id: "ver-1", workflow_id: "wf-1", version: 1 });
      (WorkflowVersion.create as ReturnType<typeof vi.fn>).mockResolvedValue(ver);
      (WorkflowVersion.pruneOldVersions as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.autosave({
        id: "wf-1",
        graph: { nodes: [], edges: [] },
        force: true
      });

      expect(result.skipped).toBe(false);
      expect(result.message).toBe("Autosaved successfully");
      expect(wf.save).toHaveBeenCalled();
    });

    it("rate-limits without force flag", async () => {
      const wf = makeWorkflow({ id: "wf-rl", user_id: "user-1" });
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);
      (WorkflowVersion.nextVersion as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      (WorkflowVersion.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeVersion({ id: "ver-1" })
      );
      (WorkflowVersion.pruneOldVersions as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const caller = createCaller(makeCtx());
      // First save (force=true to set the timestamp)
      await caller.workflows.autosave({
        id: "wf-rl",
        graph: { nodes: [], edges: [] },
        force: true
      });
      // Second save immediately (no force) — should be rate-limited
      const result = await caller.workflows.autosave({
        id: "wf-rl",
        graph: { nodes: [], edges: [] }
      });
      expect(result.skipped).toBe(true);
    });

    it("throws NOT_FOUND when workflow does not exist", async () => {
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.workflows.autosave({
          id: "missing",
          graph: { nodes: [], edges: [] }
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.workflows.autosave({
          id: "wf-1",
          graph: { nodes: [], edges: [] }
        })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ── tools ─────────────────────────────────────────────────────────────────
  describe("tools", () => {
    it("returns workflow tools list", async () => {
      const wf = makeWorkflow({ id: "wf-1", name: "My Tool" });
      (wf as unknown as { tool_name: string }).tool_name = "my_tool";
      (Workflow.paginateTools as ReturnType<typeof vi.fn>).mockResolvedValue([
        [wf],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.tools({ limit: 100 });
      expect(result.workflows).toHaveLength(1);
      expect(result.workflows[0]?.name).toBe("My Tool");
      expect(result.next).toBeNull();
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.workflows.tools({})).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── examples ──────────────────────────────────────────────────────────────
  describe("examples", () => {
    it("returns examples list (empty when no examplesDir configured)", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.workflows.examples({});
      expect(result).toHaveProperty("workflows");
      expect(Array.isArray(result.workflows)).toBe(true);
      expect(result.next).toBeNull();
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.workflows.examples({})).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── public ────────────────────────────────────────────────────────────────
  describe("public", () => {
    describe("list", () => {
      it("returns public workflows without auth", async () => {
        const wf = makeWorkflow({ id: "wf-pub", access: "public" });
        (Workflow.paginatePublic as ReturnType<typeof vi.fn>).mockResolvedValue([
          [wf],
          ""
        ]);

        const caller = createCaller(makeCtx({ userId: null }));
        const result = await caller.workflows.public.list({ limit: 10 });
        expect(result.workflows).toHaveLength(1);
        expect(result.next).toBeNull();
      });
    });

    describe("get", () => {
      it("returns a public workflow without auth", async () => {
        const wf = makeWorkflow({
          id: "wf-pub",
          access: "public",
          user_id: "some-user"
        });
        (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);

        const caller = createCaller(makeCtx({ userId: null }));
        const result = await caller.workflows.public.get({ id: "wf-pub" });
        expect(result.id).toBe("wf-pub");
      });

      it("throws NOT_FOUND for private workflow", async () => {
        const wf = makeWorkflow({
          id: "wf-priv",
          access: "private",
          user_id: "some-user"
        });
        (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);

        const caller = createCaller(makeCtx({ userId: null }));
        await expect(
          caller.workflows.public.get({ id: "wf-priv" })
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      });
    });
  });

  // ── app ───────────────────────────────────────────────────────────────────
  describe("app", () => {
    it("returns app metadata with default baseUrl", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.workflows.app({ id: "wf-1" });
      expect(result.workflow_id).toBe("wf-1");
      expect(result.api_url).toBe("http://127.0.0.1:7777");
    });

    it("uses provided baseUrl", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.workflows.app({
        id: "wf-1",
        baseUrl: "https://example.com"
      });
      expect(result.api_url).toBe("https://example.com");
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.workflows.app({ id: "wf-1" })).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    });
  });

  // ── generateName ──────────────────────────────────────────────────────────
  describe("generateName", () => {
    it("derives a name from node types", async () => {
      const wf = makeWorkflow({
        id: "wf-1",
        user_id: "user-1",
        graph: {
          nodes: [
            { id: "n1", type: "nodetool.text.Generate" },
            { id: "n2", type: "nodetool.image.Transform" }
          ],
          edges: []
        }
      });
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.generateName({ id: "wf-1" });
      expect(result.name).toContain("Workflow");
    });

    it("throws NOT_FOUND when workflow does not exist", async () => {
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx());
      await expect(
        caller.workflows.generateName({ id: "missing" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects unauthenticated callers", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.workflows.generateName({ id: "wf-1" })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // ── versions ──────────────────────────────────────────────────────────────
  describe("versions", () => {
    describe("list", () => {
      it("returns versions for an owned workflow", async () => {
        const wf = makeWorkflow({ id: "wf-1", user_id: "user-1" });
        (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);
        const ver = makeVersion({ id: "ver-1", workflow_id: "wf-1", version: 1 });
        (WorkflowVersion.listForWorkflow as ReturnType<typeof vi.fn>).mockResolvedValue([ver]);

        const caller = createCaller(makeCtx());
        const result = await caller.workflows.versions.list({
          id: "wf-1",
          limit: 100
        });
        expect(result.versions).toHaveLength(1);
        expect(result.versions[0]?.id).toBe("ver-1");
      });

      it("throws NOT_FOUND when user doesn't own workflow", async () => {
        const wf = makeWorkflow({ id: "wf-1", user_id: "other-user" });
        (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);

        const caller = createCaller(makeCtx());
        await expect(
          caller.workflows.versions.list({ id: "wf-1" })
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("rejects unauthenticated callers", async () => {
        const caller = createCaller(makeCtx({ userId: null }));
        await expect(
          caller.workflows.versions.list({ id: "wf-1" })
        ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      });
    });

    describe("create", () => {
      it("creates a new version", async () => {
        const wf = makeWorkflow({ id: "wf-1", user_id: "user-1" });
        (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);
        (WorkflowVersion.nextVersion as ReturnType<typeof vi.fn>).mockResolvedValue(2);
        const ver = makeVersion({ id: "ver-2", version: 2 });
        (WorkflowVersion.create as ReturnType<typeof vi.fn>).mockResolvedValue(ver);

        const caller = createCaller(makeCtx());
        const result = await caller.workflows.versions.create({ id: "wf-1" });
        expect(result.id).toBe("ver-2");
        expect(result.version).toBe(2);
      });

      it("throws NOT_FOUND when workflow does not exist", async () => {
        (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        const caller = createCaller(makeCtx());
        await expect(
          caller.workflows.versions.create({ id: "missing" })
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("rejects unauthenticated callers", async () => {
        const caller = createCaller(makeCtx({ userId: null }));
        await expect(
          caller.workflows.versions.create({ id: "wf-1" })
        ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      });
    });

    describe("get", () => {
      it("returns a specific version by number", async () => {
        const wf = makeWorkflow({ id: "wf-1", user_id: "user-1" });
        (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);
        const ver = makeVersion({ id: "ver-1", version: 1 });
        (WorkflowVersion.findByVersion as ReturnType<typeof vi.fn>).mockResolvedValue(ver);

        const caller = createCaller(makeCtx());
        const result = await caller.workflows.versions.get({
          id: "wf-1",
          version: 1
        });
        expect(result.id).toBe("ver-1");
        expect(result.version).toBe(1);
      });

      it("throws NOT_FOUND for missing version", async () => {
        const wf = makeWorkflow({ id: "wf-1", user_id: "user-1" });
        (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);
        (WorkflowVersion.findByVersion as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        const caller = createCaller(makeCtx());
        await expect(
          caller.workflows.versions.get({ id: "wf-1", version: 99 })
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("rejects unauthenticated callers", async () => {
        const caller = createCaller(makeCtx({ userId: null }));
        await expect(
          caller.workflows.versions.get({ id: "wf-1", version: 1 })
        ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      });
    });

    describe("restore", () => {
      it("restores workflow graph from version", async () => {
        const wf = makeWorkflow({ id: "wf-1", user_id: "user-1" });
        (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);
        const ver = makeVersion({
          id: "ver-1",
          version: 1,
          graph: { nodes: [{ id: "n1", type: "test.Node" }], edges: [] }
        });
        (WorkflowVersion.findByVersion as ReturnType<typeof vi.fn>).mockResolvedValue(ver);

        const caller = createCaller(makeCtx());
        const result = await caller.workflows.versions.restore({
          id: "wf-1",
          version: 1
        });
        expect(result.id).toBe("wf-1");
        expect(wf.save).toHaveBeenCalled();
      });

      it("throws NOT_FOUND for missing version", async () => {
        const wf = makeWorkflow({ id: "wf-1", user_id: "user-1" });
        (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);
        (WorkflowVersion.findByVersion as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        const caller = createCaller(makeCtx());
        await expect(
          caller.workflows.versions.restore({ id: "wf-1", version: 99 })
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("rejects unauthenticated callers", async () => {
        const caller = createCaller(makeCtx({ userId: null }));
        await expect(
          caller.workflows.versions.restore({ id: "wf-1", version: 1 })
        ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      });
    });

    describe("delete", () => {
      it("deletes a version by id", async () => {
        const ver = makeVersion({
          id: "ver-1",
          user_id: "user-1",
          workflow_id: "wf-1"
        });
        (WorkflowVersion.get as ReturnType<typeof vi.fn>).mockResolvedValue(ver);

        const caller = createCaller(makeCtx());
        const result = await caller.workflows.versions.delete({
          id: "wf-1",
          version_id: "ver-1"
        });
        expect(result).toEqual({ ok: true });
        expect(ver.delete).toHaveBeenCalled();
      });

      it("throws NOT_FOUND when version does not exist", async () => {
        (WorkflowVersion.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        const caller = createCaller(makeCtx());
        await expect(
          caller.workflows.versions.delete({
            id: "wf-1",
            version_id: "missing"
          })
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      });

      it("throws NOT_FOUND when user doesn't own the version", async () => {
        const ver = makeVersion({ id: "ver-1", user_id: "other-user" });
        (WorkflowVersion.get as ReturnType<typeof vi.fn>).mockResolvedValue(ver);

        const caller = createCaller(makeCtx());
        await expect(
          caller.workflows.versions.delete({
            id: "wf-1",
            version_id: "ver-1"
          })
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(ver.delete).not.toHaveBeenCalled();
      });

      it("rejects unauthenticated callers", async () => {
        const caller = createCaller(makeCtx({ userId: null }));
        await expect(
          caller.workflows.versions.delete({
            id: "wf-1",
            version_id: "ver-1"
          })
        ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      });
    });
  });
});
