import { describe, it, expect, vi, beforeEach } from "vitest";

const workflowFind = vi.fn();
const workspaceFind = vi.fn();
const ensureDefault = vi.fn();

vi.mock("@nodetool-ai/models", () => ({
  Workflow: { find: (u: string, id: string) => workflowFind(u, id) },
  Workspace: {
    find: (u: string, id: string) => workspaceFind(u, id),
    ensureDefault: (u: string) => ensureDefault(u)
  }
}));

class FakeProcessingContext {
  opts: unknown;
  constructor(opts: unknown) {
    this.opts = opts;
  }
}
class FakeFileStorageAdapter {
  dir: string;
  constructor(dir: string) {
    this.dir = dir;
  }
}

vi.mock("@nodetool-ai/runtime", () => ({
  PERMISSION_GATE_CONTEXT_KEY: "nodetool_permission_gate",
  headlessGate: (hostName: string) => ({
    mode: "auto",
    sessionAllow: new Set<string>(),
    requestApproval: async () => "deny",
    hostName
  }),
  ProcessingContext: class {
    opts: unknown;
    variables: Record<string, unknown> = {};
    constructor(opts: unknown) {
      this.opts = opts;
    }
    set(key: string, value: unknown): void {
      this.variables[key] = value;
    }
  },
  FileStorageAdapter: class {
    dir: string;
    constructor(dir: string) {
      this.dir = dir;
    }
  },
  // The resolver builds a Workspace rather than handing back a path; these
  // stand in for the real factories so the test can read `localDir` off what
  // comes back.
  createLocalWorkspace: (dir: string) => ({ localDir: dir }),
  createWorkspace: (_storage: unknown, opts: { prefix?: string }) => ({
    localDir: null,
    prefix: opts?.prefix
  })
}));

import {
  resolveWorkflowWorkspace,
  buildWorkspaceExecutionContext
} from "../src/lib/workflow-workspace.js";

describe("resolveWorkflowWorkspace", () => {
  beforeEach(() => {
    workflowFind.mockReset();
    workspaceFind.mockReset();
    ensureDefault.mockReset();
    ensureDefault.mockResolvedValue({
      path: "/abs/default",
      isAccessible: () => true,
      isVirtual: () => false
    });
  });

  it("falls back to the default workspace when the workflow is not found", async () => {
    workflowFind.mockResolvedValue(null);
    expect(await resolveWorkflowWorkspace("wf", "user")).toMatchObject({ localDir: "/abs/default" });
  });

  it("falls back to the default workspace when the workflow has none", async () => {
    workflowFind.mockResolvedValue({ workspace_id: null });
    expect(await resolveWorkflowWorkspace("wf", "user")).toMatchObject({ localDir: "/abs/default" });
    expect(workspaceFind).not.toHaveBeenCalled();
  });

  it("falls back to the default workspace for a run with no workflow", async () => {
    expect(await resolveWorkflowWorkspace(null, "user")).toMatchObject({ localDir: "/abs/default" });
    expect(workflowFind).not.toHaveBeenCalled();
    expect(ensureDefault).toHaveBeenCalledWith("user");
  });

  it("falls back to the default workspace when the workspace is not found", async () => {
    workflowFind.mockResolvedValue({ workspace_id: "ws1" });
    workspaceFind.mockResolvedValue(null);
    expect(await resolveWorkflowWorkspace("wf", "user")).toMatchObject({ localDir: "/abs/default" });
  });

  it("falls back to the default workspace when the chosen one is unusable", async () => {
    workflowFind.mockResolvedValue({ workspace_id: "ws1" });
    workspaceFind.mockResolvedValue({
      path: "/ws",
      isAccessible: () => false,
      isVirtual: () => false
    });
    expect(await resolveWorkflowWorkspace("wf", "user")).toMatchObject({ localDir: "/abs/default" });
  });

  it("returns null when even the default workspace is unusable", async () => {
    workflowFind.mockResolvedValue({ workspace_id: null });
    ensureDefault.mockResolvedValue({
      path: "/abs/default",
      isAccessible: () => false,
      isVirtual: () => false
    });
    expect(await resolveWorkflowWorkspace("wf", "user")).toBeNull();
  });

  it("returns the workflow's own workspace when accessible", async () => {
    workflowFind.mockResolvedValue({ workspace_id: "ws1" });
    workspaceFind.mockResolvedValue({
      path: "/abs/workspace",
      isAccessible: () => true,
      isVirtual: () => false
    });
    expect(await resolveWorkflowWorkspace("wf", "user")).toMatchObject({
      localDir: "/abs/workspace"
    });
  });

  it("returns null and swallows errors when a lookup throws", async () => {
    workflowFind.mockRejectedValue(new Error("db down"));
    expect(await resolveWorkflowWorkspace("wf", "user")).toBeNull();
  });

  it("handles non-Error thrown values", async () => {
    workflowFind.mockRejectedValue("string failure");
    expect(await resolveWorkflowWorkspace("wf", "user")).toBeNull();
  });
});

describe("buildWorkspaceExecutionContext", () => {
  it("passes the workspace through to the context", () => {
    const ctx = buildWorkspaceExecutionContext({
      jobId: "j1",
      workflowId: "wf1",
      userId: "u1",
      workspace: { localDir: "/ws", storage: { dir: "/ws" } }
    }) as any;
    expect(ctx.opts.jobId).toBe("j1");
    expect(ctx.opts.workflowId).toBe("wf1");
    expect(ctx.opts.userId).toBe("u1");
    expect(ctx.opts.workspace.localDir).toBe("/ws");
  });

  it("carries a null workspace through", () => {
    const ctx = buildWorkspaceExecutionContext({
      jobId: "j2",
      workflowId: null,
      userId: "u2",
      workspace: null
    }) as any;
    expect(ctx.opts.workspace).toBeNull();
  });

  it("defaults workflowId to null when omitted", () => {
    const ctx = buildWorkspaceExecutionContext({
      jobId: "j3",
      userId: "u3",
      workspace: null
    }) as any;
    expect(ctx.opts.workflowId).toBeNull();
  });
});
