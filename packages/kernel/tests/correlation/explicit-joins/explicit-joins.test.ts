/**
 * Explicit join algebra.
 *
 *   Zip matches independent iteration sources by identity, not arrival
 *   Zip respects common parent grouping
 *   Zip sibling outputs share one minted token (emitGroup)
 *   Cross emits cartesian product within the common parent
 *   Cross enforces max_output_count
 *
 * See docs/correlation-design.md §7.
 */

import { describe, expect, it } from "vitest";
import {
  runWorkflow,
  iterationOutput,
  dataEdge,
  seedSource,
  zipExecutor,
  crossExecutor
} from "../_harness.js";
import {
  assertSiblingOutputsShareToken,
  valuesFrom
} from "../_assertions.js";
import type { NodeDescriptor, Edge } from "@nodetool-ai/protocol";

function zipNode(id: string): NodeDescriptor {
  return {
    id,
    type: "test.Zip",
    is_streaming_input: true,
    is_join_node: true,
    outputs: { left: "any", right: "any", index: "int" },
    output_correlation: {
      left: iterationOutput("zip"),
      right: iterationOutput("zip"),
      index: iterationOutput("zip")
    }
  };
}

function crossNode(id: string): NodeDescriptor {
  return {
    id,
    type: "test.Cross",
    is_streaming_input: true,
    is_join_node: true,
    outputs: { left: "any", right: "any" },
    output_correlation: {
      left: iterationOutput("cross"),
      right: iterationOutput("cross")
    }
  };
}

describe("explicit-joins — Zip pairs independent sources by identity", () => {
  it("two seeds with incomparable roots pair correctly even when emitted out of order", async () => {
    const { result, captured } = await runWorkflow({
      jobId: "zip-identity",
      nodes: [
        {
          id: "a",
          type: "test.SeedA",
          is_streaming_input: true,
          outputs: { value: "any" },
          output_correlation: { value: iterationOutput("items") }
        },
        {
          id: "b",
          type: "test.SeedB",
          is_streaming_input: true,
          outputs: { value: "any" },
          output_correlation: { value: iterationOutput("items") }
        },
        zipNode("zip"),
        { id: "ls", type: "test.Sink", is_streaming_input: true },
        { id: "rs", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("a", "value", "zip", "left"),
        dataEdge("b", "value", "zip", "right"),
        dataEdge("zip", "left", "ls", "value"),
        dataEdge("zip", "right", "rs", "value")
      ],
      executors: {
        a: seedSource([
          { value: "A0", lineage: { "a:items": { index: 0 } } },
          { value: "A1", lineage: { "a:items": { index: 1 } } }
        ]),
        b: seedSource([
          // Out of order on purpose.
          { value: "B1", lineage: { "b:items": { index: 1 } } },
          { value: "B0", lineage: { "b:items": { index: 0 } } }
        ]),
        zip: zipExecutor()
      },
      captureFrom: { ls: ["value"], rs: ["value"] }
    });

    expect(result.status).toBe("completed");
    const left = captured.get("ls")!.get("value")!;
    const right = captured.get("rs")!.get("value")!;

    // Pair set is {A0+B0, A1+B1}.
    const pairs = left.map((e, i) => `${e.data}+${right[i].data}`).sort();
    expect(pairs).toEqual(["A0+B0", "A1+B1"]);
  });

  it("sibling outputs (left, right, index) share one minted zip:zip token per pair", async () => {
    const { result, captured } = await runWorkflow({
      jobId: "zip-siblings",
      nodes: [
        {
          id: "a",
          type: "test.SeedA",
          is_streaming_input: true,
          outputs: { value: "any" },
          output_correlation: { value: iterationOutput("items") }
        },
        {
          id: "b",
          type: "test.SeedB",
          is_streaming_input: true,
          outputs: { value: "any" },
          output_correlation: { value: iterationOutput("items") }
        },
        zipNode("zip"),
        { id: "ls", type: "test.Sink", is_streaming_input: true },
        { id: "rs", type: "test.Sink", is_streaming_input: true },
        { id: "is", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("a", "value", "zip", "left"),
        dataEdge("b", "value", "zip", "right"),
        dataEdge("zip", "left", "ls", "value"),
        dataEdge("zip", "right", "rs", "value"),
        dataEdge("zip", "index", "is", "value")
      ],
      executors: {
        a: seedSource([
          { value: "A0", lineage: { "a:items": { index: 0 } } },
          { value: "A1", lineage: { "a:items": { index: 1 } } }
        ]),
        b: seedSource([
          { value: "B0", lineage: { "b:items": { index: 0 } } },
          { value: "B1", lineage: { "b:items": { index: 1 } } }
        ]),
        zip: zipExecutor()
      },
      captureFrom: { ls: ["value"], rs: ["value"], is: ["value"] }
    });

    expect(result.status).toBe("completed");
    const left = captured.get("ls")!.get("value")!;
    const right = captured.get("rs")!.get("value")!;
    const idx = captured.get("is")!.get("value")!;

    // All three siblings carry the SAME zip:zip token per pair.
    assertSiblingOutputsShareToken(
      { left, right, index: idx },
      "zip:zip"
    );
  });
});

describe("explicit-joins — Cross emits cartesian product", () => {
  it("Cross of {1,2} × {a,b,c} produces six pairs with distinct cross tokens", async () => {
    const { result, captured } = await runWorkflow({
      jobId: "cross-product",
      nodes: [
        {
          id: "a",
          type: "test.SeedA",
          is_streaming_input: true,
          outputs: { value: "any" },
          output_correlation: { value: iterationOutput("items") }
        },
        {
          id: "b",
          type: "test.SeedB",
          is_streaming_input: true,
          outputs: { value: "any" },
          output_correlation: { value: iterationOutput("items") }
        },
        crossNode("x"),
        { id: "ls", type: "test.Sink", is_streaming_input: true },
        { id: "rs", type: "test.Sink", is_streaming_input: true }
      ],
      edges: [
        dataEdge("a", "value", "x", "left"),
        dataEdge("b", "value", "x", "right"),
        dataEdge("x", "left", "ls", "value"),
        dataEdge("x", "right", "rs", "value")
      ],
      executors: {
        a: seedSource([
          { value: 1, lineage: { "a:items": { index: 0 } } },
          { value: 2, lineage: { "a:items": { index: 1 } } }
        ]),
        b: seedSource([
          { value: "a", lineage: { "b:items": { index: 0 } } },
          { value: "b", lineage: { "b:items": { index: 1 } } },
          { value: "c", lineage: { "b:items": { index: 2 } } }
        ]),
        x: crossExecutor()
      },
      captureFrom: { ls: ["value"], rs: ["value"] }
    });

    expect(result.status).toBe("completed");
    const left = captured.get("ls")!.get("value")!;
    const right = captured.get("rs")!.get("value")!;
    expect(left).toHaveLength(6);
    expect(right).toHaveLength(6);

    // Every pair carries a x:cross token; tokens are distinct.
    const tokens = left.map((e) => e.correlation_lineage["x:cross"]?.index);
    expect(tokens.every((t) => t !== undefined)).toBe(true);
    expect(new Set(tokens).size).toBe(6);

    // Sibling left and right share their cross token per emit.
    assertSiblingOutputsShareToken({ left, right }, "x:cross");

    // The pair set is the full cartesian product.
    const pairs = left.map((e, i) => `${e.data}+${right[i].data}`).sort();
    expect(pairs).toEqual([
      "1+a",
      "1+b",
      "1+c",
      "2+a",
      "2+b",
      "2+c"
    ]);
  });

  it("Cross errors when max_output_count would be exceeded", async () => {
    const out = await runWorkflow({
      jobId: "cross-limit",
      nodes: [
        {
          id: "a",
          type: "test.SeedA",
          is_streaming_input: true,
          outputs: { value: "any" },
          output_correlation: { value: iterationOutput("items") }
        },
        {
          id: "b",
          type: "test.SeedB",
          is_streaming_input: true,
          outputs: { value: "any" },
          output_correlation: { value: iterationOutput("items") }
        },
        crossNode("x")
      ],
      edges: [
        dataEdge("a", "value", "x", "left"),
        dataEdge("b", "value", "x", "right")
      ],
      executors: {
        a: seedSource([
          { value: 1, lineage: { "a:items": { index: 0 } } },
          { value: 2, lineage: { "a:items": { index: 1 } } }
        ]),
        b: seedSource([
          { value: "a", lineage: { "b:items": { index: 0 } } },
          { value: "b", lineage: { "b:items": { index: 1 } } },
          { value: "c", lineage: { "b:items": { index: 2 } } }
        ]),
        x: crossExecutor(2) // cap at 2 — product would be 6
      }
    });
    // The Cross actor errors with max_output_count; surfaced as a node_update
    // with status: "error" rather than failing the whole workflow.
    const crossErrors = out.result.messages.filter(
      (m) =>
        m.type === "node_update" &&
        (m as { node_id?: string }).node_id === "x" &&
        (m as { status?: string }).status === "error"
    );
    expect(crossErrors.length).toBeGreaterThan(0);
    expect((crossErrors[0] as { error?: string }).error ?? "").toMatch(
      /max_output_count/
    );
  });
});
