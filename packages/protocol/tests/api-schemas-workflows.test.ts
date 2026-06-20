/**
 * Contract tests for the workflow graph schemas, focused on dynamic_outputs.
 *
 * dynamic_outputs carries per-slot type metadata declared by dynamic nodes.
 * The schema must accept well-formed metadata (an object with a `type` string,
 * nesting through `type_args`) while rejecting malformed entries — primitives,
 * null, or objects missing a type — so bad metadata can't reach the runner.
 */

import { describe, it, expect } from "vitest";
import { graphNode } from "../src/api-schemas/workflows.js";

const baseNode = { id: "n1", type: "nodetool.test.Dyn" };

describe("graphNode.dynamic_outputs", () => {
  it("accepts well-formed type metadata", () => {
    const result = graphNode.safeParse({
      ...baseNode,
      dynamic_outputs: {
        video: { type: "video", type_args: [] },
        items: {
          type: "list",
          type_args: [{ type: "str", type_args: [] }]
        }
      }
    });
    expect(result.success).toBe(true);
  });

  it("accepts a node with no dynamic_outputs", () => {
    expect(graphNode.safeParse(baseNode).success).toBe(true);
  });

  it("rejects a primitive value where metadata is expected", () => {
    const result = graphNode.safeParse({
      ...baseNode,
      dynamic_outputs: { out: "str" }
    });
    expect(result.success).toBe(false);
  });

  it("rejects a null value", () => {
    const result = graphNode.safeParse({
      ...baseNode,
      dynamic_outputs: { out: null }
    });
    expect(result.success).toBe(false);
  });

  it("rejects metadata missing the type field", () => {
    const result = graphNode.safeParse({
      ...baseNode,
      dynamic_outputs: { out: { type_args: [] } }
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-string type", () => {
    const result = graphNode.safeParse({
      ...baseNode,
      dynamic_outputs: { out: { type: 42 } }
    });
    expect(result.success).toBe(false);
  });
});
