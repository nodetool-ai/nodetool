import { describe, expect, it } from "vitest";
import {
  createInput,
  graphNode,
  updateInput
} from "../src/api-schemas/workflows.js";

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

describe("workflow project scope", () => {
  it("defaults project scope when creating a workflow", () => {
    expect(
      createInput.parse({ name: "Workflow", graph: { nodes: [], edges: [] } })
        .project_id
    ).toBe("default");
  });

  it("leaves project scope absent when updating without a scope", () => {
    expect(
      updateInput.parse({
        id: "workflow-1",
        name: "Workflow",
        graph: { nodes: [], edges: [] }
      })
    ).not.toHaveProperty("project_id");
  });
});
