import { describe, it, expect } from "vitest";
import { Graph, type ResolvedNodeType } from "../src/graph.js";

/**
 * A resolver whose type says "buffered" but which can answer per node, the way
 * node-sdk's `createGraphNodeTypeResolver` does for a class declaring
 * `resolveStreamingInput`.
 */
const resolverWith = (withInstanceFlags: boolean) => ({
  async resolveNodeType(nodeType: string): Promise<ResolvedNodeType | null> {
    if (nodeType !== "test.BodyMode") return null;
    return {
      nodeType,
      propertyTypes: { code: "str" },
      outputs: { output: "any" },
      descriptorDefaults: { is_streaming_input: false },
      ...(withInstanceFlags && {
        resolveInstanceFlags: (node: {
          properties?: Record<string, unknown>;
        }) => ({
          is_streaming_input: String(node.properties?.code ?? "").includes(
            "stream("
          )
        })
      })
    };
  }
});

const load = async (
  code: string,
  withInstanceFlags: boolean,
  saved?: boolean
): Promise<boolean | undefined> => {
  const graph = await Graph.loadFromDict(
    {
      nodes: [
        {
          id: "n1",
          type: "test.BodyMode",
          properties: { code },
          ...(saved === undefined ? {} : { is_streaming_input: saved })
        }
      ],
      edges: []
    },
    { resolver: resolverWith(withInstanceFlags) }
  );
  return graph.findNode("n1")?.is_streaming_input;
};

describe("Graph.loadFromDict resolveInstanceFlags", () => {
  it("takes the slot descriptorDefaults holds when the resolver answers per node", async () => {
    expect(await load('stream("a");', true)).toBe(true);
    expect(await load("return {};", true)).toBe(false);
  });

  it("falls back to descriptorDefaults when the resolver has no per-node answer", async () => {
    // The same body, the same descriptorDefaults: without the closure the
    // per-type false is the answer, which is today's exact behavior.
    expect(await load('stream("a");', false)).toBe(false);
  });

  it("beats a stale saved flag", async () => {
    expect(await load("return {};", true, true)).toBe(false);
    expect(await load('stream("a");', true, false)).toBe(true);
  });

  it("leaves the other hydrated flags alone", async () => {
    const graph = await Graph.loadFromDict(
      {
        nodes: [
          {
            id: "n1",
            type: "test.BodyMode",
            properties: { code: 'stream("a");' },
            is_streaming_output: true,
            is_controlled: true
          }
        ],
        edges: []
      },
      { resolver: resolverWith(true) }
    );
    const node = graph.findNode("n1");
    expect(node?.is_streaming_input).toBe(true);
    // descriptorDefaults omits both, so the saved values still apply.
    expect(node?.is_streaming_output).toBe(true);
    expect(node?.is_controlled).toBe(true);
  });
});
