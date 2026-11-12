import { describe, expect, it } from "vitest";
import { AUDIO_RUN_KEY, type NodeDescriptor } from "@nodetool-ai/protocol";
import { WorkflowRunner } from "../src/runner.js";

it("resolves the transport before any node starts and resets it for a reused context", async () => {
  const values = new Map<string, unknown>();
  const context = {
    emit() {},
    set(key: string, value: unknown) {
      values.set(key, value);
    }
  };
  const calls: unknown[] = [];
  const execute = async (nodes: NodeDescriptor[]): Promise<void> => {
    const runner = new WorkflowRunner("audio", {
      executionContext: context,
      resolveExecutor: () => ({
        async process() {
          calls.push(values.get(AUDIO_RUN_KEY));
          return { output: 1 };
        }
      })
    });
    const result = await runner.run({ job_id: "audio" }, { nodes, edges: [] });
    expect(result.status).toBe("completed");
  };
  await execute([
    {
      id: "recorder",
      type: "test.Recorder",
      audio_sink: "render",
      properties: { duration: 2 },
      outputs: { output: "any" }
    }
  ]);
  await execute([
    {
      id: "monitor",
      type: "test.Monitor",
      audio_sink: "live",
      outputs: { output: "any" }
    }
  ]);
  await execute([
    { id: "ordinary", type: "test.Ordinary", outputs: { output: "any" } }
  ]);
  expect(calls).toEqual([
    { mode: "render", endFrame: 88200 },
    { mode: "live", endFrame: null },
    { mode: "free", endFrame: null }
  ]);
});

describe("hosts without a variable store", () => {
  it("keeps ordinary lean runners usable", async () => {
    const runner = new WorkflowRunner("lean", {
      executionContext: { emit() {} },
      resolveExecutor: () => ({
        async process() {
          return { output: 1 };
        }
      })
    });
    expect(
      (
        await runner.run(
          { job_id: "lean" },
          {
            nodes: [{ id: "n", type: "test.Node", outputs: { output: "any" } }],
            edges: []
          }
        )
      ).status
    ).toBe("completed");
  });
});
