import { describe, it, expect, vi, beforeEach } from "vitest";

const findOwned = vi.fn();
const ensurePersonal = vi.fn();
const workspaceFind = vi.fn();
const ensureDefault = vi.fn();

// This fixture exercises workspace resolution with synthetic database rows.
vi.mock("@nodetool-ai/execution/service", () =>
  import("../../execution/src/service/workflow-workspace.js")
);

vi.mock("@nodetool-ai/models", () => ({
  LOOSE_PROJECT_ID: "default",
  // Asset services install their file mover when they load.
  setAssetFileMover: () => {},
  // The workflow and timeline file syncs install themselves on their models
  // when they load.
  setWorkflowFileSync: () => {},
  setTimelineFileSync: () => {},
  setStoryboardFileSync: () => {},
  setScriptFileSync: () => {},
  setApplicationFileSync: () => {},
  setJsScriptFileSync: () => {},
  setImageDocumentFileSync: () => {},
  Project: {
    findOwned: (u: string, id: string) => findOwned(u, id),
    ensurePersonal: (u: string) => ensurePersonal(u)
  },
  Workspace: {
    find: (u: string, id: string) => workspaceFind(u, id),
    ensureDefault: (u: string) => ensureDefault(u)
  }
}));

vi.mock("@nodetool-ai/runtime", () => ({
  PERMISSION_GATE_CONTEXT_KEY: "nodetool_permission_gate",
  RESERVED_WORKSPACE_DIR: ".nodetool",
  // Loading the folder service installs its resolver for asset services.
  setProjectFolderResolver: () => {},
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
  resolveProjectWorkspace,
  buildWorkspaceExecutionContext
} from "../src/lib/workflow-workspace.js";

function folderRow(path: string, accessible = true) {
  return {
    id: "ws1",
    user_id: "user",
    path,
    isAccessible: () => accessible,
    isVirtual: () => !path.startsWith("/")
  };
}

describe("resolveProjectWorkspace", () => {
  beforeEach(() => {
    findOwned.mockReset();
    ensurePersonal.mockReset();
    workspaceFind.mockReset();
    ensureDefault.mockReset();
    ensurePersonal.mockResolvedValue({
      id: "personal:user",
      name: "Personal",
      workspace_id: "personal-ws"
    });
  });

  it("returns the folder named by the project's workspace_id", async () => {
    findOwned.mockResolvedValue({ id: "pA", name: "A", workspace_id: "ws1" });
    workspaceFind.mockResolvedValue(folderRow("/abs/A"));
    expect(await resolveProjectWorkspace("pA", "user")).toMatchObject({
      ok: true,
      projectId: "pA",
      workspace: { localDir: "/abs/A" }
    });
    expect(workspaceFind).toHaveBeenCalledWith("user", "ws1");
  });

  it.each([null, undefined, "", "default", "personal:user"])(
    "uses the Personal project for %s",
    async (projectId) => {
      workspaceFind.mockResolvedValue(folderRow("/abs/personal"));
      expect(await resolveProjectWorkspace(projectId, "user")).toMatchObject({
        ok: true,
        projectId: "personal:user",
        workspace: { localDir: "/abs/personal" }
      });
      expect(workspaceFind).toHaveBeenCalledWith("user", "personal-ws");
      expect(findOwned).not.toHaveBeenCalled();
    }
  );

  it("refuses a project it cannot find", async () => {
    findOwned.mockResolvedValue(null);
    expect(await resolveProjectWorkspace("gone", "user")).toEqual({
      ok: false,
      projectId: "gone",
      reason: "Project not found: gone"
    });
  });

  it("refuses a project with no folder and creates none", async () => {
    findOwned.mockResolvedValue({ id: "pA", name: "A", workspace_id: null });
    expect(await resolveProjectWorkspace("pA", "user")).toEqual({
      ok: false,
      projectId: "pA",
      reason: 'Project folder not found: project "A" has no folder'
    });
    expect(workspaceFind).not.toHaveBeenCalled();
  });

  it("refuses a folder whose row is gone", async () => {
    findOwned.mockResolvedValue({ id: "pA", name: "A", workspace_id: "ws1" });
    workspaceFind.mockResolvedValue(null);
    expect(await resolveProjectWorkspace("pA", "user")).toMatchObject({
      ok: false,
      reason: 'Project folder not found: project "A" has no folder'
    });
  });

  it("names an unreachable local folder by its path", async () => {
    findOwned.mockResolvedValue({ id: "pA", name: "A", workspace_id: "ws1" });
    workspaceFind.mockResolvedValue(folderRow("/abs/unplugged", false));
    expect(await resolveProjectWorkspace("pA", "user")).toEqual({
      ok: false,
      projectId: "pA",
      reason: "Project folder not found: /abs/unplugged"
    });
  });

  it("names no host path on a production server", async () => {
    const previous = process.env["NODETOOL_ENV"];
    process.env["NODETOOL_ENV"] = "production";
    try {
      findOwned.mockResolvedValue({ id: "pA", name: "A", workspace_id: "ws1" });
      workspaceFind.mockResolvedValue(folderRow("/srv/data/A", false));
      expect(await resolveProjectWorkspace("pA", "user")).toMatchObject({
        ok: false,
        reason: 'Project folder not found: the folder of project "A"'
      });
    } finally {
      if (previous === undefined) delete process.env["NODETOOL_ENV"];
      else process.env["NODETOOL_ENV"] = previous;
    }
  });

  it("refuses a cloud folder when no cloud storage is configured", async () => {
    findOwned.mockResolvedValue({ id: "pA", name: "A", workspace_id: "ws1" });
    workspaceFind.mockResolvedValue(folderRow("workspaces/user/projects/x"));
    expect(await resolveProjectWorkspace("pA", "user")).toMatchObject({
      ok: false,
      reason: "Project folder not found: cloud folder storage is not configured"
    });
  });

  it("never falls back to the user's default workspace", async () => {
    findOwned.mockResolvedValue({ id: "pA", name: "A", workspace_id: null });
    await resolveProjectWorkspace("pA", "user");
    findOwned.mockResolvedValue(null);
    await resolveProjectWorkspace("pB", "user");
    workspaceFind.mockResolvedValue(folderRow("/abs/unplugged", false));
    await resolveProjectWorkspace(null, "user");
    expect(ensureDefault).not.toHaveBeenCalled();
  });

  it("reports a lookup that throws instead of rejecting", async () => {
    findOwned.mockRejectedValue(new Error("db down"));
    expect(await resolveProjectWorkspace("pA", "user")).toEqual({
      ok: false,
      projectId: "pA",
      reason: "Project folder not found: db down"
    });
  });

  it("handles non-Error thrown values", async () => {
    findOwned.mockRejectedValue("string failure");
    expect(await resolveProjectWorkspace("pA", "user")).toMatchObject({
      ok: false,
      reason: "Project folder not found: string failure"
    });
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
