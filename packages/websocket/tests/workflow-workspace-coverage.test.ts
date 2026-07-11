import { describe, it, expect, vi, beforeEach } from "vitest";

const workflowFind = vi.fn();
const workspaceFind = vi.fn();

vi.mock("@nodetool-ai/models", () => ({
  Workflow: { find: (u: string, id: string) => workflowFind(u, id) },
  Workspace: { find: (u: string, id: string) => workspaceFind(u, id) }
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
  ProcessingContext: class {
    opts: unknown;
    constructor(opts: unknown) {
      this.opts = opts;
    }
  },
  FileStorageAdapter: class {
    dir: string;
    constructor(dir: string) {
      this.dir = dir;
    }
  }
}));

import {
  resolveWorkflowWorkspace,
  buildWorkspaceExecutionContext
} from "../src/lib/workflow-workspace.js";

describe("resolveWorkflowWorkspace", () => {
  beforeEach(() => {
    workflowFind.mockReset();
    workspaceFind.mockReset();
  });

  it("returns null when the workflow is not found", async () => {
    workflowFind.mockResolvedValue(null);
    expect(await resolveWorkflowWorkspace("wf", "user")).toBeNull();
  });

  it("returns null when the workflow has no workspace_id", async () => {
    workflowFind.mockResolvedValue({ workspace_id: null });
    expect(await resolveWorkflowWorkspace("wf", "user")).toBeNull();
    expect(workspaceFind).not.toHaveBeenCalled();
  });

  it("returns null when the workspace is not found", async () => {
    workflowFind.mockResolvedValue({ workspace_id: "ws1" });
    workspaceFind.mockResolvedValue(null);
    expect(await resolveWorkflowWorkspace("wf", "user")).toBeNull();
  });

  it("returns null when the workspace is not accessible", async () => {
    workflowFind.mockResolvedValue({ workspace_id: "ws1" });
    workspaceFind.mockResolvedValue({
      path: "/ws",
      isAccessible: () => false
    });
    expect(await resolveWorkflowWorkspace("wf", "user")).toBeNull();
  });

  it("returns the workspace path when accessible", async () => {
    workflowFind.mockResolvedValue({ workspace_id: "ws1" });
    workspaceFind.mockResolvedValue({
      path: "/abs/workspace",
      isAccessible: () => true
    });
    expect(await resolveWorkflowWorkspace("wf", "user")).toBe(
      "/abs/workspace"
    );
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
  it("creates a context with a FileStorageAdapter when workspaceDir is set", () => {
    const ctx = buildWorkspaceExecutionContext({
      jobId: "j1",
      workflowId: "wf1",
      userId: "u1",
      workspaceDir: "/ws"
    }) as any;
    expect(ctx.opts.jobId).toBe("j1");
    expect(ctx.opts.workflowId).toBe("wf1");
    expect(ctx.opts.userId).toBe("u1");
    expect(ctx.opts.workspaceDir).toBe("/ws");
    expect(ctx.opts.workspaceStorage).toBeTruthy();
    expect(ctx.opts.workspaceStorage.dir).toBe("/ws");
  });

  it("uses null storage when workspaceDir is null", () => {
    const ctx = buildWorkspaceExecutionContext({
      jobId: "j2",
      workflowId: null,
      userId: "u2",
      workspaceDir: null
    }) as any;
    expect(ctx.opts.workspaceStorage).toBeNull();
    expect(ctx.opts.workspaceDir).toBeNull();
  });

  it("defaults workflowId to null when omitted", () => {
    const ctx = buildWorkspaceExecutionContext({
      jobId: "j3",
      userId: "u3",
      workspaceDir: null
    }) as any;
    expect(ctx.opts.workflowId).toBeNull();
  });
});
