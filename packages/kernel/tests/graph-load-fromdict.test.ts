import { describe, it, expect } from "vitest";
import {
  Graph,
  GraphValidationError,
  type ResolvedNodeType
} from "../src/graph.js";

describe("Graph.loadFromDict", () => {
  it("hydrates nodes with resolver-provided metadata", async () => {
    const resolver = {
      async resolveNodeType(
        nodeType: string
      ): Promise<ResolvedNodeType | null> {
        if (nodeType !== "test.Input") return null;
        return {
          nodeType,
          propertyTypes: { value: "int" },
          outputs: { output: "int" },
          descriptorDefaults: {
            name: "Resolved Input",
            sync_mode: "on_any",
            is_streaming_output: false
          }
        };
      }
    };

    const graph = await Graph.loadFromDict(
      {
        nodes: [{ id: "n1", type: "test.Input", data: { value: 5 } }],
        edges: []
      },
      { resolver }
    );

    const node = graph.findNode("n1");
    expect(node?.properties).toEqual({ value: 5 });
    expect(node?.propertyTypes).toEqual({ value: "int" });
    expect(node?.outputs).toEqual({ output: "int" });
    expect(node?.sync_mode).toBe("on_any");
    expect(node?.name).toBe("Resolved Input");
  });

  it("drops unresolved nodes and connected edges when skipErrors is true", async () => {
    const graph = await Graph.loadFromDict(
      {
        nodes: [
          { id: "ok", type: "test.Known" },
          { id: "bad", type: "test.Unknown" }
        ],
        edges: [
          {
            source: "ok",
            sourceHandle: "out",
            target: "bad",
            targetHandle: "in"
          },
          {
            source: "bad",
            sourceHandle: "out",
            target: "ok",
            targetHandle: "in"
          }
        ]
      },
      {
        resolver: {
          resolveNodeType: async (nodeType) =>
            nodeType === "test.Known"
              ? { nodeType, descriptorDefaults: {} }
              : null
        },
        skipErrors: true
      }
    );

    expect(graph.nodes.map((node) => node.id)).toEqual(["ok"]);
    expect(graph.edges).toEqual([]);
  });

  it("throws on unresolved node types when skipErrors is false", async () => {
    await expect(
      Graph.loadFromDict(
        {
          nodes: [{ id: "bad", type: "test.Unknown" }],
          edges: []
        },
        {
          resolver: {
            resolveNodeType: async () => null
          },
          skipErrors: false
        }
      )
    ).rejects.toThrow(GraphValidationError);
  });

  it("enforces resolved property definitions when allowUndefinedProperties is false", async () => {
    await expect(
      Graph.loadFromDict(
        {
          nodes: [
            { id: "n1", type: "test.Strict", data: { allowed: 1, extra: 2 } }
          ],
          edges: []
        },
        {
          resolver: {
            resolveNodeType: async (nodeType) => ({
              nodeType,
              propertyTypes: { allowed: "int" }
            })
          },
          allowUndefinedProperties: false,
          skipErrors: false
        }
      )
    ).rejects.toThrow("Property extra does not exist");
  });

  it("strips unknown properties when allowUndefinedProperties is false and skipErrors is true", async () => {
    const graph = await Graph.loadFromDict(
      {
        nodes: [
          { id: "n1", type: "test.Strict", data: { allowed: 1, extra: 2 } }
        ],
        edges: []
      },
      {
        resolver: {
          resolveNodeType: async (nodeType) => ({
            nodeType,
            propertyTypes: { allowed: "int" }
          })
        },
        allowUndefinedProperties: false,
        skipErrors: true
      }
    );

    expect(graph.findNode("n1")?.properties).toEqual({ allowed: 1 });
  });
});
