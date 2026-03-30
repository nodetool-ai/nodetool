/**
 * Tests for T-MSG-5: Graph input/output schema.
 */
import { describe, it, expect } from "vitest";
import { Graph } from "../src/graph.js";
import type { NodeDescriptor, Edge } from "@nodetool/protocol";

function makeNode(overrides: Partial<NodeDescriptor> & { id: string; type: string }): NodeDescriptor {
  return { ...overrides };
}

describe("T-MSG-5: Graph input/output schema", () => {
  describe("getInputSchema", () => {
    it("returns schema for IntInput node", () => {
      const graph = new Graph({
        nodes: [
          makeNode({
            id: "n1",
            type: "nodetool.input.IntInput",
            name: "x",
            outputs: { output: "int" },
          }),
        ],
        edges: [],
      });
      const schema = graph.getInputSchema();
      expect(schema.properties).toHaveProperty("x");
      expect((schema.properties as Record<string, any>).x.type).toBe("number");
      expect(schema.required).toContain("x");
    });

    it("returns schema for multiple input nodes", () => {
      const graph = new Graph({
        nodes: [
          makeNode({
            id: "n1",
            type: "nodetool.input.IntInput",
            name: "count",
            outputs: { output: "int" },
          }),
          makeNode({
            id: "n2",
            type: "nodetool.input.StringInput",
            name: "label",
            outputs: { output: "str" },
          }),
          makeNode({
            id: "n3",
            type: "nodetool.math.Add",
            outputs: { output: "int" },
          }),
        ],
        edges: [
          { source: "n1", sourceHandle: "output", target: "n3", targetHandle: "a" },
        ],
      });
      const schema = graph.getInputSchema();
      expect(Object.keys(schema.properties as object)).toHaveLength(2);
      expect((schema.properties as Record<string, any>).count.type).toBe("number");
      expect((schema.properties as Record<string, any>).label.type).toBe("string");
    });

    it("returns empty schema when no input nodes", () => {
      const graph = new Graph({
        nodes: [
          makeNode({
            id: "n1",
            type: "nodetool.math.Add",
            outputs: { output: "int" },
          }),
        ],
        edges: [],
      });
      const schema = graph.getInputSchema();
      expect(schema.properties).toEqual({});
      expect(schema.required).toEqual([]);
    });

    it("uses node id as name fallback", () => {
      const graph = new Graph({
        nodes: [
          makeNode({
            id: "my_input",
            type: "nodetool.input.FloatInput",
            outputs: { output: "float" },
          }),
        ],
        edges: [],
      });
      const schema = graph.getInputSchema();
      expect(schema.properties).toHaveProperty("my_input");
      expect((schema.properties as Record<string, any>).my_input.type).toBe("number");
    });

    it("maps bool output to boolean json schema type", () => {
      const graph = new Graph({
        nodes: [
          makeNode({
            id: "n1",
            type: "nodetool.input.BoolInput",
            name: "flag",
            outputs: { output: "bool" },
          }),
        ],
        edges: [],
      });
      const schema = graph.getInputSchema();
      expect((schema.properties as Record<string, any>).flag.type).toBe("boolean");
    });
  });

  describe("getOutputSchema", () => {
    it("returns schema for output nodes", () => {
      const graph = new Graph({
        nodes: [
          makeNode({
            id: "n1",
            type: "nodetool.output.IntOutput",
            name: "result",
            outputs: { output: "int" },
          }),
        ],
        edges: [],
      });
      const schema = graph.getOutputSchema();
      expect(schema.properties).toHaveProperty("result");
      expect((schema.properties as Record<string, any>).result.type).toBe("number");
      expect(schema.required).toContain("result");
    });

    it("returns empty schema when no output nodes", () => {
      const graph = new Graph({
        nodes: [
          makeNode({
            id: "n1",
            type: "nodetool.math.Add",
            outputs: { output: "int" },
          }),
        ],
        edges: [],
      });
      const schema = graph.getOutputSchema();
      expect(schema.properties).toEqual({});
      expect(schema.required).toEqual([]);
    });

    it("handles mixed input and output nodes", () => {
      const graph = new Graph({
        nodes: [
          makeNode({
            id: "n1",
            type: "nodetool.input.IntInput",
            name: "x",
            outputs: { output: "int" },
          }),
          makeNode({
            id: "n2",
            type: "nodetool.output.StringOutput",
            name: "text",
            outputs: { output: "str" },
          }),
        ],
        edges: [],
      });
      const inputSchema = graph.getInputSchema();
      const outputSchema = graph.getOutputSchema();
      expect(Object.keys(inputSchema.properties as object)).toHaveLength(1);
      expect(Object.keys(outputSchema.properties as object)).toHaveLength(1);
      expect(inputSchema.properties).toHaveProperty("x");
      expect(outputSchema.properties).toHaveProperty("text");
    });
  });
});
