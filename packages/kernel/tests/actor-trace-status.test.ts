import { describe, expect, it, vi } from "vitest";
import { WorkflowRunner } from "../src/runner.js";

interface FakeSpan {
  nodeId: string;
  statuses: Array<{ code: number; message?: string }>;
  exceptions: unknown[];
}

const spans = vi.hoisted(() => [] as FakeSpan[]);

vi.mock("@nodetool-ai/runtime/tracing", async (importOriginal) => {
  const original = await importOriginal<typeof import("@nodetool-ai/runtime/tracing")>();
  return {
    ...original,
    // Mirror withSpan: OK is set only when no ERROR status was recorded.
    withNodeSpan: async (attrs: { nodeId: string }, fn: (span: unknown) => Promise<unknown>) => {
      const rec: FakeSpan = { nodeId: attrs.nodeId, statuses: [], exceptions: [] };
      spans.push(rec);
      const span = {
        setStatus: (s: { code: number; message?: string }) => rec.statuses.push(s),
        recordException: (e: unknown) => rec.exceptions.push(e)
      };
      const result = await fn(span);
      if (!rec.statuses.some((s) => s.code === 2)) rec.statuses.push({ code: 1 });
      return result;
    }
  };
});

const finalStatus = (id: string) => spans.find((s) => s.nodeId === id)!.statuses.at(-1);

describe("node.process span status", () => {
  it("marks a node whose process throws as ERROR with the message", async () => {
    spans.length = 0;
    const runner = new WorkflowRunner("span-fail", {
      resolveExecutor: (node) => ({
        process: async () => {
          if (node.id === "bad") throw new Error("tts exploded");
          return { output: 1 };
        }
      })
    });
    const result = await runner.run({ job_id: "span-fail" }, {
      nodes: [{ id: "good", type: "test.Ok" }, { id: "bad", type: "test.Bad" }],
      edges: []
    });
    expect(result.status).toBe("failed");
    await vi.waitFor(() => expect(finalStatus("bad")).toBeDefined());
    expect(finalStatus("bad")).toEqual({ code: 2, message: "Error: tts exploded" });
    expect(spans.find((s) => s.nodeId === "bad")!.exceptions).toHaveLength(1);
    expect(finalStatus("good")).toEqual({ code: 1 });
  });

  it("keeps a node that completes OK", async () => {
    spans.length = 0;
    const runner = new WorkflowRunner("span-ok", { resolveExecutor: () => ({ process: async () => ({ output: 1 }) }) });
    const result = await runner.run({ job_id: "span-ok" }, { nodes: [{ id: "a", type: "test.Ok" }], edges: [] });
    expect(result.status).toBe("completed");
    expect(finalStatus("a")).toEqual({ code: 1 });
  });
});
