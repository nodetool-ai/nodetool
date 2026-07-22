import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

// ── Mock @nodetool-ai/models ────────────────────────────────────────────────────
vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    Workflow: {
      ...actual.Workflow,
      get: vi.fn(),
      find: vi.fn(),
      paginate: vi.fn(),
      paginatePublic: vi.fn(),
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
    WorkflowCollaborator: {
      ...actual.WorkflowCollaborator,
      findFor: vi.fn(),
      listForWorkflow: vi.fn(),
      listForUser: vi.fn(),
      upsert: vi.fn(),
      remove: vi.fn(),
      removeAllForWorkflow: vi.fn()
    },
    WorkflowShare: {
      ...actual.WorkflowShare,
      get: vi.fn(),
      findByToken: vi.fn(),
      listForWorkflow: vi.fn(),
      ensure: vi.fn(),
      removeAllForWorkflow: vi.fn()
    }
  };
});

import {
  Workflow,
  WorkflowVersion,
  WorkflowCollaborator,
  WorkflowShare
} from "@nodetool-ai/models";

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
  run_mode?: string | null;
  tags?: string[];
  graph?: { nodes: unknown[]; edges: unknown[] };
}) {
  const wf = {
    id: opts.id ?? "wf-1",
    user_id: opts.user_id ?? "user-1",
    name: opts.name ?? "Test Workflow",
    access: opts.access ?? "private",
    // Preserve explicit `null` for legacy rows while defaulting only when omitted.
    run_mode: opts.run_mode === undefined ? "workflow" : opts.run_mode,
    tool_name: null,
    package_name: null,
    path: null,
    tags: opts.tags ?? [],
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
    (WorkflowCollaborator.findFor as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
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

    it("uses default run_mode filtering when no run_mode is passed", async () => {
      // The router passes runMode: undefined to Workflow.paginate; paginate itself
      // applies the default DB filter (run_mode IN ("workflow", null)) which excludes
      // embedded modes like "clip", "layer", and "image".
      const workflow = makeWorkflow({ id: "wf-default", run_mode: "workflow" });
      const legacy = makeWorkflow({ id: "wf-legacy", run_mode: null });
      (Workflow.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [workflow, legacy],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.list({});
      expect(Workflow.paginate).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ runMode: undefined })
      );
      expect(result.workflows.map((w) => w.id)).toEqual([
        "wf-default",
        "wf-legacy"
      ]);
    });

    it("does not include embedded run_modes (clip/layer/image) in default listing", async () => {
      // When no run_mode filter is supplied, the router passes runMode: undefined to
      // paginate(), which then applies `run_mode IN ("workflow", null)` at the DB level.
      // This test verifies the router delegates filtering to paginate rather than doing
      // its own secondary filter.
      const standalone = makeWorkflow({ id: "wf-standalone", run_mode: "workflow" });
      (Workflow.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [standalone],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.list({});
      // Only the standalone workflow is returned (paginate filtered out clip/layer/image)
      expect(result.workflows.map((w) => w.id)).toEqual(["wf-standalone"]);
    });

    it("includes clip workflows when run_mode filter is set", async () => {
      const clip = makeWorkflow({ id: "wf-clip", run_mode: "clip" });
      (Workflow.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [clip],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.list({ run_mode: "clip" });
      expect(result.workflows.map((w) => w.id)).toEqual(["wf-clip"]);
    });

    it("supports explicit run_mode filter for layer and image embedded workflows", async () => {
      const layer = makeWorkflow({ id: "wf-layer", run_mode: "layer" });
      const image = makeWorkflow({ id: "wf-image", run_mode: "image" });
      (Workflow.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [layer],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const layerResult = await caller.workflows.list({ run_mode: "layer" });
      expect(layerResult.workflows.map((w) => w.id)).toEqual(["wf-layer"]);
      expect(Workflow.paginate).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ runMode: "layer" })
      );

      (Workflow.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [image],
        ""
      ]);
      const imageResult = await caller.workflows.list({ run_mode: "image" });
      expect(imageResult.workflows.map((w) => w.id)).toEqual(["wf-image"]);
    });

    it("filters to workflows with terminal media outputs when mediaOutput=true", async () => {
      const withOutput = makeWorkflow({
        id: "wf-out",
        graph: {
          nodes: [{ id: "out-1", type: "nodetool.output.ImageOutput", data: {} }],
          edges: []
        }
      });
      const withoutOutput = makeWorkflow({
        id: "wf-no-out",
        graph: {
          nodes: [{ id: "n1", type: "nodetool.input.TextInput", data: {} }],
          edges: []
        }
      });
      (Workflow.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
        [withOutput, withoutOutput],
        ""
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.list({ mediaOutput: true });
      expect(result.workflows.map((w) => w.id)).toEqual(["wf-out"]);
      expect(result.next).toBeNull();
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

  describe("terminalOutputs", () => {
    it("returns only terminal media-output nodes", async () => {
      const wf = makeWorkflow({
        id: "wf-1",
        user_id: "user-1",
        graph: {
          nodes: [
            { id: "img-out", type: "nodetool.output.ImageOutput", data: { name: "Image" } },
            { id: "video-out", type: "nodetool.output.VideoOutput", data: { name: "Video" } },
            { id: "downstream", type: "nodetool.misc.PassThrough", data: {} }
          ],
          edges: [
            {
              source: "video-out",
              target: "downstream",
              sourceHandle: "output",
              targetHandle: "input"
            }
          ]
        }
      });
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.terminalOutputs({ id: "wf-1" });
      expect(result.outputs.map((output) => output.id)).toEqual(["img-out"]);
    });

    // Regression (#13): a client-controlled node type equal to an inherited
    // Object.prototype key ("toString", "constructor", …) must NOT be treated
    // as a terminal media-output node. The `in` operator matched prototype
    // keys; Object.hasOwn does not.
    it("does not classify Object.prototype-keyed node types as media outputs", async () => {
      const wf = makeWorkflow({
        id: "wf-proto",
        user_id: "user-1",
        graph: {
          nodes: [
            { id: "evil-1", type: "toString", data: {} },
            { id: "evil-2", type: "constructor", data: {} },
            { id: "evil-3", type: "hasOwnProperty", data: {} }
          ],
          edges: []
        }
      });
      (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(wf);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.terminalOutputs({ id: "wf-proto" });
      expect(result.outputs).toEqual([]);
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

      it("throws NOT_FOUND when user owns neither the version nor the workflow", async () => {
        const ver = makeVersion({ id: "ver-1", user_id: "other-user" });
        (WorkflowVersion.get as ReturnType<typeof vi.fn>).mockResolvedValue(ver);
        (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeWorkflow({ id: "wf-1", user_id: "other-owner" })
        );

        const caller = createCaller(makeCtx());
        await expect(
          caller.workflows.versions.delete({
            id: "wf-1",
            version_id: "ver-1"
          })
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
        expect(ver.delete).not.toHaveBeenCalled();
      });

      it("lets the workflow owner delete a collaborator's version", async () => {
        const ver = makeVersion({ id: "ver-1", user_id: "collaborator" });
        (WorkflowVersion.get as ReturnType<typeof vi.fn>).mockResolvedValue(ver);
        (Workflow.get as ReturnType<typeof vi.fn>).mockResolvedValue(
          makeWorkflow({ id: "wf-1", user_id: "user-1" })
        );

        const caller = createCaller(makeCtx());
        const result = await caller.workflows.versions.delete({
          id: "wf-1",
          version_id: "ver-1"
        });
        expect(result.ok).toBe(true);
        expect(ver.delete).toHaveBeenCalled();
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

// ── sharing ──────────────────────────────────────────────────────────────────

describe("workflows.sharing router", () => {
  const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

  function makeGrant(opts: {
    workflow_id?: string;
    user_id?: string;
    role?: "viewer" | "editor";
  }) {
    return {
      workflow_id: opts.workflow_id ?? "wf-1",
      user_id: opts.user_id ?? "user-2",
      role: opts.role ?? "viewer",
      invited_by: "user-1",
      created_at: "2026-07-10T00:00:00Z",
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    };
  }

  function makeShare(opts: {
    id?: string;
    workflow_id?: string;
    role?: "viewer" | "editor";
    revoked_at?: string | null;
  }) {
    const revokedAt = opts.revoked_at ?? null;
    return {
      id: opts.id ?? "share-1",
      workflow_id: opts.workflow_id ?? "wf-1",
      token: "tok_abc",
      role: opts.role ?? "viewer",
      created_by: "user-1",
      created_at: "2026-07-10T00:00:00Z",
      revoked_at: revokedAt,
      isRevoked: revokedAt != null,
      revoke: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined)
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    asMock(WorkflowCollaborator.findFor).mockResolvedValue(null);
  });

  describe("collaborator access to core procedures", () => {
    it("get allows a viewer collaborator on a private workflow", async () => {
      const wf = makeWorkflow({ id: "wf-1", user_id: "owner-1" });
      asMock(Workflow.get).mockResolvedValue(wf);
      asMock(WorkflowCollaborator.findFor).mockResolvedValue(
        makeGrant({ user_id: "user-1", role: "viewer" })
      );

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.get({ id: "wf-1" });
      expect(result.id).toBe("wf-1");
      expect(WorkflowCollaborator.findFor).toHaveBeenCalledWith(
        "wf-1",
        "user-1"
      );
    });

    it("get still hides private workflows without a grant", async () => {
      const wf = makeWorkflow({ id: "wf-1", user_id: "owner-1" });
      asMock(Workflow.get).mockResolvedValue(wf);

      const caller = createCaller(makeCtx());
      await expect(caller.workflows.get({ id: "wf-1" })).rejects.toMatchObject(
        { code: "NOT_FOUND" }
      );
    });

    it("update allows an editor collaborator but preserves access", async () => {
      const wf = makeWorkflow({
        id: "wf-1",
        user_id: "owner-1",
        access: "private"
      });
      asMock(Workflow.get).mockResolvedValue(wf);
      asMock(WorkflowCollaborator.findFor).mockResolvedValue(
        makeGrant({ user_id: "user-1", role: "editor" })
      );

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.update({
        id: "wf-1",
        name: "Renamed",
        graph: { nodes: [], edges: [] },
        access: "public"
      });
      expect(result.name).toBe("Renamed");
      // An editor cannot flip visibility.
      expect(wf.access).toBe("private");
      expect(wf.save).toHaveBeenCalled();
    });

    it("update rejects a viewer collaborator", async () => {
      const wf = makeWorkflow({ id: "wf-1", user_id: "owner-1" });
      asMock(Workflow.get).mockResolvedValue(wf);
      asMock(WorkflowCollaborator.findFor).mockResolvedValue(
        makeGrant({ user_id: "user-1", role: "viewer" })
      );

      const caller = createCaller(makeCtx());
      await expect(
        caller.workflows.update({
          id: "wf-1",
          name: "Nope",
          graph: { nodes: [], edges: [] }
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("sharing.get", () => {
    it("returns collaborators and shares for the owner", async () => {
      const wf = makeWorkflow({ id: "wf-1", user_id: "user-1" });
      asMock(Workflow.get).mockResolvedValue(wf);
      asMock(WorkflowCollaborator.listForWorkflow).mockResolvedValue([
        makeGrant({ user_id: "user-2", role: "editor" })
      ]);
      asMock(WorkflowShare.listForWorkflow).mockResolvedValue([
        makeShare({ role: "viewer" })
      ]);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.sharing.get({ id: "wf-1" });
      expect(result.collaborators).toHaveLength(1);
      expect(result.collaborators[0].role).toBe("editor");
      expect(result.shares[0].token).toBe("tok_abc");
    });

    it("rejects non-owners, including editors", async () => {
      const wf = makeWorkflow({ id: "wf-1", user_id: "owner-1" });
      asMock(Workflow.get).mockResolvedValue(wf);
      asMock(WorkflowCollaborator.findFor).mockResolvedValue(
        makeGrant({ user_id: "user-1", role: "editor" })
      );

      const caller = createCaller(makeCtx());
      await expect(
        caller.workflows.sharing.get({ id: "wf-1" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("sharing.createLink / revokeLink", () => {
    it("mints a share link for the owner", async () => {
      const wf = makeWorkflow({ id: "wf-1", user_id: "user-1" });
      asMock(Workflow.get).mockResolvedValue(wf);
      asMock(WorkflowShare.ensure).mockResolvedValue(
        makeShare({ role: "editor" })
      );

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.sharing.createLink({
        id: "wf-1",
        role: "editor"
      });
      expect(result.token).toBe("tok_abc");
      expect(WorkflowShare.ensure).toHaveBeenCalledWith({
        workflowId: "wf-1",
        role: "editor",
        createdBy: "user-1"
      });
    });

    it("revokes a link belonging to the workflow", async () => {
      const wf = makeWorkflow({ id: "wf-1", user_id: "user-1" });
      asMock(Workflow.get).mockResolvedValue(wf);
      const share = makeShare({ id: "share-1", workflow_id: "wf-1" });
      asMock(WorkflowShare.get).mockResolvedValue(share);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.sharing.revokeLink({
        id: "wf-1",
        share_id: "share-1"
      });
      expect(result.ok).toBe(true);
      expect(share.revoke).toHaveBeenCalled();
    });

    it("rejects revoking a share of a different workflow", async () => {
      const wf = makeWorkflow({ id: "wf-1", user_id: "user-1" });
      asMock(Workflow.get).mockResolvedValue(wf);
      asMock(WorkflowShare.get).mockResolvedValue(
        makeShare({ id: "share-1", workflow_id: "wf-other" })
      );

      const caller = createCaller(makeCtx());
      await expect(
        caller.workflows.sharing.revokeLink({ id: "wf-1", share_id: "share-1" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("sharing.accept", () => {
    it("grants the caller the link's role", async () => {
      const wf = makeWorkflow({ id: "wf-1", user_id: "owner-1" });
      asMock(WorkflowShare.findByToken).mockResolvedValue(
        makeShare({ role: "editor" })
      );
      asMock(Workflow.get).mockResolvedValue(wf);
      asMock(WorkflowCollaborator.upsert).mockResolvedValue(
        makeGrant({ user_id: "user-1", role: "editor" })
      );

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.sharing.accept({
        token: "tok_abc"
      });
      expect(result.workflow.id).toBe("wf-1");
      expect(result.role).toBe("editor");
      expect(WorkflowCollaborator.upsert).toHaveBeenCalledWith({
        workflowId: "wf-1",
        userId: "user-1",
        role: "editor",
        invitedBy: "user-1"
      });
    });

    it("does not grant the owner a collaborator row", async () => {
      const wf = makeWorkflow({ id: "wf-1", user_id: "user-1" });
      asMock(WorkflowShare.findByToken).mockResolvedValue(makeShare({}));
      asMock(Workflow.get).mockResolvedValue(wf);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.sharing.accept({
        token: "tok_abc"
      });
      expect(result.workflow.id).toBe("wf-1");
      expect(WorkflowCollaborator.upsert).not.toHaveBeenCalled();
    });

    it("rejects revoked tokens", async () => {
      asMock(WorkflowShare.findByToken).mockResolvedValue(
        makeShare({ revoked_at: "2026-07-09T00:00:00Z" })
      );

      const caller = createCaller(makeCtx());
      await expect(
        caller.workflows.sharing.accept({ token: "tok_abc" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects unknown tokens", async () => {
      asMock(WorkflowShare.findByToken).mockResolvedValue(null);

      const caller = createCaller(makeCtx());
      await expect(
        caller.workflows.sharing.accept({ token: "nope" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("sharing.removeCollaborator", () => {
    it("owner removes a collaborator", async () => {
      const wf = makeWorkflow({ id: "wf-1", user_id: "user-1" });
      asMock(Workflow.get).mockResolvedValue(wf);
      asMock(WorkflowCollaborator.remove).mockResolvedValue(true);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.sharing.removeCollaborator({
        id: "wf-1",
        user_id: "user-2"
      });
      expect(result.ok).toBe(true);
      expect(WorkflowCollaborator.remove).toHaveBeenCalledWith(
        "wf-1",
        "user-2"
      );
    });

    it("a collaborator can remove themself without ownership", async () => {
      asMock(WorkflowCollaborator.remove).mockResolvedValue(true);

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.sharing.removeCollaborator({
        id: "wf-1",
        user_id: "user-1"
      });
      expect(result.ok).toBe(true);
      // Ownership was never checked — Workflow.get untouched.
      expect(Workflow.get).not.toHaveBeenCalled();
    });

    it("a non-owner cannot remove someone else", async () => {
      const wf = makeWorkflow({ id: "wf-1", user_id: "owner-1" });
      asMock(Workflow.get).mockResolvedValue(wf);

      const caller = createCaller(makeCtx());
      await expect(
        caller.workflows.sharing.removeCollaborator({
          id: "wf-1",
          user_id: "user-2"
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("sharing.sharedWithMe", () => {
    it("sharedWithMe lists granted workflows with roles", async () => {
      asMock(WorkflowCollaborator.listForUser).mockResolvedValue([
        makeGrant({ workflow_id: "wf-1", user_id: "user-1", role: "editor" }),
        makeGrant({ workflow_id: "wf-gone", user_id: "user-1", role: "viewer" })
      ]);
      asMock(Workflow.get).mockImplementation(async (id: string) =>
        id === "wf-1" ? makeWorkflow({ id: "wf-1", user_id: "owner-1" }) : null
      );

      const caller = createCaller(makeCtx());
      const result = await caller.workflows.sharing.sharedWithMe({});
      expect(result.workflows).toHaveLength(1);
      expect(result.workflows[0].id).toBe("wf-1");
      expect(result.workflows[0].shared_role).toBe("editor");
    });
  });
});
