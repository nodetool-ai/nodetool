/**
 * Tests for the debug harness message collector (src/debug/collector.ts).
 *
 * Uses loosely-typed message bags (the same shape both the server RunResult and
 * the browser event log produce) so it runs under the CLI vitest stub setup,
 * where `@nodetool-ai/protocol` is a type-only import.
 */
import { describe, expect, it } from "vitest";
import { collectExecutionSummary, previewValue } from "../src/debug/collector.js";

describe("previewValue", () => {
  it("truncates long strings with a length marker", () => {
    const long = "x".repeat(5000);
    const out = previewValue(long) as string;
    expect(out.length).toBeLessThan(long.length);
    expect(out).toContain("[5000 chars]");
  });

  it("collapses base64-ish blob fields inside objects", () => {
    const out = previewValue({ data: "A".repeat(1000), type: "image" }) as Record<string, unknown>;
    expect(String(out.data)).toContain("[1000 chars]");
    expect(out.type).toBe("image");
  });

  it("summarizes binary payloads", () => {
    expect(previewValue(new Uint8Array(10))).toBe("<binary 10 bytes>");
  });

  it("caps array fan-out", () => {
    const out = previewValue(Array.from({ length: 100 }, (_, i) => i)) as unknown[];
    expect(out.length).toBe(51); // 50 items + "…[50 more]"
    expect(out[50]).toBe("…[50 more]");
  });
});

describe("collectExecutionSummary", () => {
  it("folds node, output, log, edge and error messages", () => {
    const summary = collectExecutionSummary([
      { type: "job_update", status: "running" },
      { type: "node_update", node_id: "a", node_type: "ns.A", node_name: "A", status: "running" },
      { type: "node_update", node_id: "a", node_type: "ns.A", node_name: "A", status: "completed" },
      { type: "node_update", node_id: "b", node_type: "ns.B", status: "error", error: "boom" },
      {
        type: "output_update",
        node_id: "a",
        node_name: "A",
        output_name: "out",
        output_type: "string",
        value: "hello"
      },
      { type: "log_update", node_id: "a", severity: "info", content: "did a thing" },
      { type: "edge_update", edge_id: "e1", status: "completed", counter: 3 },
      {
        type: "llm_call",
        node_id: "a",
        provider: "openai",
        model: "gpt-x",
        tokens_input: 10,
        tokens_output: 5,
        cost: 0.01,
        duration_ms: 120
      },
      { type: "job_update", status: "completed" }
    ]);

    expect(summary.status).toBe("completed");
    expect(summary.counts.nodes).toBe(2);
    expect(summary.counts.completed).toBe(1);
    expect(summary.counts.errored).toBe(1);
    expect(summary.outputs).toHaveLength(1);
    expect(summary.outputs[0]).toMatchObject({ nodeId: "a", outputName: "out", value: "hello" });
    expect(summary.logs).toHaveLength(1);
    expect(summary.edges[0]).toMatchObject({ edgeId: "e1", counter: 3 });
    expect(summary.llmCalls[0]).toMatchObject({ provider: "openai", tokensInput: 10 });

    const errored = summary.nodes.find((n) => n.nodeId === "b");
    expect(errored?.error).toBe("boom");
    expect(summary.errors.some((e) => e.message === "boom")).toBe(true);
  });

  it("does not flag a node as errored when it completes with an empty error field", () => {
    const summary = collectExecutionSummary([
      { type: "node_update", node_id: "a", status: "running", error: "" },
      { type: "node_update", node_id: "a", status: "completed", error: "" }
    ]);
    expect(summary.nodes[0].error).toBeNull();
    expect(summary.counts.errored).toBe(0);
  });

  it("captures generation_complete outputs and a top-level error", () => {
    const summary = collectExecutionSummary([
      {
        type: "generation_complete",
        node_id: "g",
        node_type: "ns.Gen",
        node_name: "Gen",
        outputs: { image: { type: "image", uri: "asset://x" } }
      },
      { type: "error", message: "fatal" },
      { type: "job_update", status: "failed", error: "fatal" }
    ]);
    const gen = summary.nodes.find((n) => n.nodeId === "g");
    expect(gen?.outputs[0].outputName).toBe("image");
    expect(summary.status).toBe("failed");
    expect(summary.error).toBe("fatal");
    // A single top-level error is not double-listed.
    expect(summary.errors.filter((e) => e.message === "fatal")).toHaveLength(1);
  });
});
