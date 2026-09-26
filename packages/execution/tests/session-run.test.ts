import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ProcessingContext, createWorkspace } from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { ExecutionSession } from "../src/index.js";
import { buildTestRegistry } from "./fixtures.js";

/** Every test connects zero Python bridges — no node type here is Python-only. */
const NO_BRIDGE = async () => null;

describe("ExecutionSession — params seeding", () => {
  it("removes a virtual workspace's staged files after the run", async () => {
    const workspace = createWorkspace(new InMemoryStorageAdapter());
    const scratch = await workspace.scratchDir();
    await writeFile(join(scratch, "staged.txt"), "temporary");
    try {
      const session = await ExecutionSession.create({
        graph: {
          nodes: [{ id: "v", type: "nodetool.input.Value", properties: {} }],
          edges: []
        },
        registry: buildTestRegistry(),
        bridgeFactory: NO_BRIDGE,
        params: { v: 1 },
        context: new ProcessingContext({
          jobId: "scratch-cleanup",
          userId: "test-user",
          workspace
        })
      });
      expect((await session.result).status).toBe("completed");
      expect(existsSync(scratch)).toBe(false);
    } finally {
      await workspace.cleanupScratch?.();
    }
  });

  it("runs a simple linear graph to completion", async () => {
    const registry = buildTestRegistry();
    const session = await ExecutionSession.create({
      graph: {
        nodes: [
          { id: "v", type: "nodetool.input.Value", properties: {} },
          { id: "double", type: "test.execution.Double", properties: {} }
        ],
        edges: [
          {
            source: "v",
            sourceHandle: "output",
            target: "double",
            targetHandle: "value"
          }
        ]
      },
      registry,
      bridgeFactory: NO_BRIDGE,
      params: { v: 21 }
    });

    const result = await session.result;

    expect(result.status).toBe("completed");
    expect(result.outputs["double"]).toEqual([42]);
  });

  it("fails cleanly for an unknown node type", async () => {
    const registry = buildTestRegistry();
    const session = await ExecutionSession.create({
      graph: {
        nodes: [{ id: "n1", type: "test.execution.DoesNotExist" }],
        edges: []
      },
      registry,
      bridgeFactory: NO_BRIDGE,
      params: {}
    });

    const result = await session.result;
    expect(result.status).toBe("failed");
  });
});

describe("ExecutionSession — streaming input seeding", () => {
  it("delivers pushInput values and completes on finishInputStream", async () => {
    const registry = buildTestRegistry();
    const session = await ExecutionSession.create({
      graph: {
        nodes: [
          { id: "src", type: "nodetool.input.StreamingValue", properties: {} },
          { id: "sink", type: "test.execution.StreamSink", properties: {} }
        ],
        edges: [
          {
            source: "src",
            sourceHandle: "output",
            target: "sink",
            targetHandle: "value"
          }
        ]
      },
      registry,
      bridgeFactory: NO_BRIDGE
    });

    await session.pushInput("src", 1);
    await session.pushInput("src", 2);
    await session.pushInput("src", 3);
    session.finishInputStream("src");

    const result = await session.result;

    expect(result.status).toBe("completed");
    expect(result.outputs["sink"]).toEqual([[1, 2, 3]]);
  });
});

describe("ExecutionSession — messages", () => {
  it("yields job_update and node_update messages for the run", async () => {
    const registry = buildTestRegistry();
    const session = await ExecutionSession.create({
      graph: {
        nodes: [
          { id: "v", type: "nodetool.input.Value", properties: {} },
          { id: "double", type: "test.execution.Double", properties: {} }
        ],
        edges: [
          {
            source: "v",
            sourceHandle: "output",
            target: "double",
            targetHandle: "value"
          }
        ]
      },
      registry,
      bridgeFactory: NO_BRIDGE,
      params: { v: 5 },
      captureMessages: true
    });

    const seen: string[] = [];
    for await (const message of session.messages) {
      seen.push(message.type);
    }
    const result = await session.result;

    expect(result.status).toBe("completed");
    expect(seen).toContain("job_update");
    expect(seen).toContain("node_update");
    expect(seen.filter((t) => t === "job_update").length).toBeGreaterThanOrEqual(2);
  });
});
