/**
 * The run context a service-layer run executes on carries the run's secrets.
 *
 * Without them `context.getSecret` answers `null` for every key and a provider
 * node sees only the process environment: an agent generated an image in a
 * chat turn and got a 401 from the same provider the moment it ran the
 * workflow it had just built.
 */

import { describe, expect, it, vi } from "vitest";
import { PERMISSION_GATE_CONTEXT_KEY } from "@nodetool-ai/runtime";

const getSecret = vi.fn(
  async (key: string, userId: string): Promise<string | null> =>
    userId === "u1" && key === "FAL_API_KEY" ? "fal-secret" : null
);

vi.mock("@nodetool-ai/models", () => ({
  Workflow: { find: vi.fn() },
  Workspace: { find: vi.fn() },
  getSecret
}));

const { buildWorkspaceExecutionContext } = await import(
  "../src/service/workflow-workspace.js"
);

describe("buildWorkspaceExecutionContext", () => {
  it("resolves the run user's secrets", async () => {
    const context = buildWorkspaceExecutionContext({
      jobId: "job-1",
      workflowId: "wf-1",
      userId: "u1",
      workspaceDir: null
    });
    await expect(context.getSecret("FAL_API_KEY")).resolves.toBe("fal-secret");
    expect(getSecret).toHaveBeenCalledWith("FAL_API_KEY", "u1");
  });

  it("reads no other account's secrets", async () => {
    const context = buildWorkspaceExecutionContext({
      jobId: "job-2",
      userId: "u2",
      workspaceDir: null
    });
    await expect(context.getSecret("FAL_API_KEY")).resolves.toBeNull();
  });

  it("takes a resolver from the host instead", async () => {
    const context = buildWorkspaceExecutionContext({
      jobId: "job-3",
      userId: "u1",
      workspaceDir: null,
      secretResolver: (key) => (key === "OPENAI_API_KEY" ? "from-host" : null)
    });
    await expect(context.getSecret("OPENAI_API_KEY")).resolves.toBe("from-host");
    await expect(context.getSecret("FAL_API_KEY")).resolves.toBeNull();
  });

  it("carries the headless gate: auto, with every escalation denied", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const context = buildWorkspaceExecutionContext({
        jobId: "job-4",
        userId: "u1",
        workspace: null
      });
      const gate = context.get<{
        mode: string;
        sessionAllow: Set<string>;
        requestApproval: (request: {
          toolName: string;
          category: "write";
          args: Record<string, unknown>;
          message: string;
        }) => Promise<string>;
      }>(PERMISSION_GATE_CONTEXT_KEY);

      expect(gate.mode).toBe("auto");
      expect(gate.sessionAllow.size).toBe(0);
      await expect(
        gate.requestApproval({
          toolName: "delete_workflow",
          category: "write",
          args: {},
          message: "Delete"
        })
      ).resolves.toBe("deny");
      expect(String(warn.mock.calls[0]?.[0])).toContain("kernel workflow run");
    } finally {
      warn.mockRestore();
    }
  });
});
