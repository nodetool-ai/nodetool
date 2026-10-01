import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WorkflowRunner } from "@nodetool-ai/kernel";
import {
  createWorkspace,
  ProcessingContext,
  type PythonBridgeBase
} from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { ExecutionSession } from "../src/session.js";
import { buildTestRegistry } from "./fixtures.js";

afterEach(() => vi.restoreAllMocks());

async function resources() {
  const workspace = createWorkspace(new InMemoryStorageAdapter());
  const scratch = await workspace.scratchDir();
  await writeFile(join(scratch, "staged"), "temporary");
  const close = vi.fn();
  // Stub only the bridge lifecycle used by this session, without a worker.
  const bridge = {
    close,
    hasNodeType: () => false,
    jobStart: vi.fn().mockResolvedValue(undefined),
    jobEnd: vi.fn().mockResolvedValue(undefined)
  } as unknown as PythonBridgeBase;
  return {
    scratch,
    close,
    workspace,
    bridge,
    context: new ProcessingContext({
      jobId: "cleanup",
      userId: "test",
      workspace
    }),
    graph: {
      nodes: [
        {
          id: "double",
          type: "test.execution.Double",
          properties: { value: 4 }
        }
      ],
      edges: []
    }
  };
}

describe("ExecutionSession resource ownership", () => {
  it("cleans staged files when hydration throws after the bridge connects", async () => {
    const owned = await resources();
    try {
      await expect(
        ExecutionSession.create({
          ...owned,
          registry: buildTestRegistry(),
          bridgeFactory: async () => owned.bridge,
          resolveNodeType: {
            resolveNodeType: async () => {
              throw new Error("hydration failed");
            }
          },
          recordCosts: false
        })
      ).rejects.toThrow("hydration failed");
      expect(owned.close).toHaveBeenCalledTimes(1);
      expect(existsSync(owned.scratch)).toBe(false);
    } finally {
      await owned.workspace.cleanupScratch?.();
    }
  });

  it.each(["completed", "failed"])(
    "closes the bridge and cleans workspace on %s",
    async (status) => {
      const owned = await resources();
      if (status === "failed") {
        owned.graph.nodes[0].type = "unknown.Node";
      }
      const session = await ExecutionSession.create({
        ...owned,
        registry: buildTestRegistry(),
        bridgeFactory: async () => owned.bridge,
        recordCosts: false
      });
      expect((await session.result).status).toBe(status);
      expect(owned.close).toHaveBeenCalledTimes(1);
      expect(existsSync(owned.scratch)).toBe(false);
    }
  );

  it("cleans workspace when connection setup fails before returning a bridge", async () => {
    const owned = await resources();
    await expect(
      ExecutionSession.create({
        ...owned,
        registry: buildTestRegistry(),
        bridgeFactory: async () => {
          throw new Error("connection failed");
        }
      })
    ).rejects.toThrow("connection failed");
    expect(existsSync(owned.scratch)).toBe(false);
  });

  it("closes the bridge and cleans workspace if the injected resolver setup throws", async () => {
    const owned = await resources();
    await expect(
      ExecutionSession.create({
        ...owned,
        registry: buildTestRegistry(),
        bridgeFactory: async () => owned.bridge,
        executorResolverFactory: () => {
          throw new Error("resolver failed");
        }
      })
    ).rejects.toThrow("resolver failed");
    expect(owned.close).toHaveBeenCalledTimes(1);
    expect(existsSync(owned.scratch)).toBe(false);
  });

  it.each(["rejects", "throws"])(
    "cleans resources when the runner unexpectedly %s",
    async (mode) => {
      const owned = await resources();
      const run = vi.spyOn(WorkflowRunner.prototype, "run");
      if (mode === "throws") {
        run.mockImplementation(() => {
          throw new Error("unexpected run rejection");
        });
      } else {
        run.mockRejectedValue(new Error("unexpected run rejection"));
      }
      const session = await ExecutionSession.create({
        ...owned,
        registry: buildTestRegistry(),
        bridgeFactory: async () => owned.bridge,
        recordCosts: false
      });
      await expect(session.result).rejects.toThrow("unexpected run rejection");
      expect(owned.bridge.jobEnd).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "abandoned" })
      );
      expect(owned.close).toHaveBeenCalledTimes(1);
      expect(existsSync(owned.scratch)).toBe(false);
    }
  );
});
