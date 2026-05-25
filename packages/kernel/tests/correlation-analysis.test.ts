/**
 * Static correlation analysis tests.
 *
 * Covers §3 of docs/correlation-design.md:
 *   - Forward chains propagate scope and repeats_per_key.
 *   - Diamonds from a single iteration source are allowed.
 *   - Iteration outputs add a new root; chunk sets repeats.
 *   - Aggregate (innermost) trims the last root.
 *   - Incomparable input scopes are rejected.
 *   - Multi-edge list handles accept comparable scopes only.
 *   - Buffered nodes reject more than one repeats_per_key max-scope input.
 *   - Close-barrier contributors include all relevant source edges.
 *   - Possible child roots are propagated through forward chains.
 */

import { describe, expect, it } from "vitest";
import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";
import {
  analyzeCorrelation,
  comparable,
  edgeKey,
  isPrefixOf,
  iterationRootId,
  projectLineageKey,
  tryProjectLineageKey
} from "../src/correlation-analysis.js";

function node(
  id: string,
  type: string,
  extras: Partial<NodeDescriptor> = {}
): NodeDescriptor {
  return { id, type, ...extras };
}

function dataEdge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
  id?: string
): Edge {
  return { id, source, sourceHandle, target, targetHandle };
}

describe("scope helpers", () => {
  it("isPrefixOf is reflexive and respects ordering", () => {
    expect(isPrefixOf([], ["a"])).toBe(true);
    expect(isPrefixOf(["a"], ["a", "b"])).toBe(true);
    expect(isPrefixOf(["a", "b"], ["a"])).toBe(false);
    expect(isPrefixOf(["a"], ["b"])).toBe(false);
    expect(isPrefixOf(["a"], ["a"])).toBe(true);
  });

  it("comparable returns true when one scope is a prefix of the other", () => {
    expect(comparable(["a"], ["a", "b"])).toBe(true);
    expect(comparable(["a", "b"], ["a"])).toBe(true);
    expect(comparable(["a"], ["b"])).toBe(false);
  });

  it("iterationRootId uses group when present", () => {
    expect(iterationRootId("n1", "output", "items")).toBe("n1:items");
    expect(iterationRootId("n1", "value", undefined)).toBe("n1:value");
  });

  it("projectLineageKey orders by static scope", () => {
    const lineage = {
      "a:items": { index: 2 },
      "b:rows": { index: 5 }
    };
    expect(projectLineageKey(lineage, ["a:items", "b:rows"])).toBe(
      "a:items=2,b:rows=5"
    );
    // Different scope order → different key.
    expect(projectLineageKey(lineage, ["b:rows", "a:items"])).toBe(
      "b:rows=5,a:items=2"
    );
    expect(projectLineageKey(lineage, [])).toBe("");
  });

  it("tryProjectLineageKey returns null when a root is missing", () => {
    expect(tryProjectLineageKey({}, ["a:items"])).toBe(null);
    expect(
      tryProjectLineageKey({ "a:items": { index: 0 } }, ["a:items"])
    ).toBe("a:items=0");
  });
});

describe("analyzeCorrelation – forward chains", () => {
  it("propagates empty scope through a single-input passthrough", () => {
    const nodes: NodeDescriptor[] = [
      node("src", "test.Source", {
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "single", source: "__execution__" }
        }
      }),
      node("mid", "test.Pass", {
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "forward", source: "value" }
        }
      })
    ];
    const edges: Edge[] = [dataEdge("src", "value", "mid", "value", "e1")];

    const result = analyzeCorrelation({ nodes, edges });
    expect(result.issues).toEqual([]);
    expect(result.edges.get("e1")?.scope).toEqual([]);
    expect(result.nodes.get("mid")?.invocationScope).toEqual([]);
    expect(result.nodes.get("mid")?.outputs.get("value")?.scope).toEqual([]);
  });

  it("adds iteration root through ForEach and propagates through forward", () => {
    const nodes: NodeDescriptor[] = [
      node("src", "test.Source", {
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "single", source: "__execution__" }
        }
      }),
      node("fe", "nodetool.control.ForEach", {
        outputs: { output: "any", index: "int" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" },
          index: { kind: "iteration", source: "__execution__", group: "items" }
        }
      }),
      node("map", "test.Map", {
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "forward", source: "value" }
        }
      })
    ];
    const edges: Edge[] = [
      dataEdge("src", "value", "fe", "input_list", "e0"),
      dataEdge("fe", "output", "map", "value", "e1")
    ];

    const result = analyzeCorrelation({ nodes, edges });
    expect(result.issues).toEqual([]);
    const feOut = result.nodes.get("fe")!.outputs.get("output")!;
    expect(feOut.scope).toEqual(["fe:items"]);
    expect(feOut.repeatsPerKey).toBe(false);
    expect(Array.from(feOut.possibleChildRoots)).toContain("fe:items");

    const mapOut = result.nodes.get("map")!.outputs.get("value")!;
    expect(mapOut.scope).toEqual(["fe:items"]);
    expect(result.edges.get("e1")?.scope).toEqual(["fe:items"]);
  });

  it("chunk outputs mark repeats_per_key", () => {
    const nodes: NodeDescriptor[] = [
      node("llm", "test.LLM", {
        outputs: { chunk: "any" },
        output_correlation: {
          chunk: { kind: "chunk", source: "__execution__" }
        }
      })
    ];
    const result = analyzeCorrelation({ nodes, edges: [] });
    expect(result.issues).toEqual([]);
    expect(result.nodes.get("llm")?.outputs.get("chunk")?.repeatsPerKey).toBe(
      true
    );
  });
});

describe("analyzeCorrelation – diamonds and joins", () => {
  it("allows a diamond from one ForEach (same scope on both branches)", () => {
    const nodes: NodeDescriptor[] = [
      node("fe", "nodetool.control.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" }
        }
      }),
      node("a", "test.Pass", {
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "forward", source: "value" }
        }
      }),
      node("b", "test.Pass", {
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "forward", source: "value" }
        }
      }),
      node("join", "test.Join", {
        propertyTypes: { left: "any", right: "any" },
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "single", source: "__execution__" }
        }
      })
    ];
    const edges: Edge[] = [
      dataEdge("fe", "output", "a", "value", "e1"),
      dataEdge("fe", "output", "b", "value", "e2"),
      dataEdge("a", "value", "join", "left", "e3"),
      dataEdge("b", "value", "join", "right", "e4")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(result.issues).toEqual([]);
    expect(result.nodes.get("join")?.invocationScope).toEqual(["fe:items"]);
    const close = result.nodes.get("join")!.outputs.get("value")!
      .closeBarrierContributors;
    expect(close.has("e3")).toBe(true);
    expect(close.has("e4")).toBe(true);
  });

  it("rejects incomparable iteration sources", () => {
    const nodes: NodeDescriptor[] = [
      node("fe1", "nodetool.control.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" }
        }
      }),
      node("fe2", "nodetool.control.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" }
        }
      }),
      node("join", "test.Join", {
        propertyTypes: { left: "any", right: "any" },
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "single", source: "__execution__" }
        }
      })
    ];
    const edges: Edge[] = [
      dataEdge("fe1", "output", "join", "left", "e1"),
      dataEdge("fe2", "output", "join", "right", "e2")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].message).toMatch(/independent iteration sources/);
  });

  it("allows nested iteration (parent prefix of child)", () => {
    const nodes: NodeDescriptor[] = [
      node("outer", "nodetool.control.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" }
        }
      }),
      node("inner", "nodetool.control.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" }
        }
      }),
      node("join", "test.Join", {
        propertyTypes: { parent: "any", child: "any" },
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "single", source: "__execution__" }
        }
      })
    ];
    const edges: Edge[] = [
      dataEdge("outer", "output", "inner", "input_list", "e1"),
      dataEdge("outer", "output", "join", "parent", "e2"),
      dataEdge("inner", "output", "join", "child", "e3")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(result.issues).toEqual([]);
    expect(result.nodes.get("join")?.invocationScope).toEqual([
      "outer:items",
      "inner:items"
    ]);
  });
});

describe("analyzeCorrelation – aggregate", () => {
  it("collapses the innermost root on stream-mode aggregators", () => {
    const nodes: NodeDescriptor[] = [
      node("fe", "nodetool.control.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" }
        }
      }),
      node("collect", "nodetool.control.Collect", {
        input_mode: "stream",
        outputs: { output: "any" },
        output_correlation: {
          output: {
            kind: "aggregate",
            source: "input_item",
            collapse: "innermost"
          }
        }
      })
    ];
    const edges: Edge[] = [
      dataEdge("fe", "output", "collect", "input_item", "e1")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(result.issues).toEqual([]);
    expect(result.nodes.get("collect")?.outputs.get("output")?.scope).toEqual(
      []
    );
  });

  it("rejects aggregate output on a buffered node", () => {
    const nodes: NodeDescriptor[] = [
      node("fe", "nodetool.control.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" }
        }
      }),
      node("bad", "test.BadCollect", {
        outputs: { output: "any" },
        output_correlation: {
          output: {
            kind: "aggregate",
            source: "input_item",
            collapse: "innermost"
          }
        }
      })
    ];
    const edges: Edge[] = [
      dataEdge("fe", "output", "bad", "input_item", "e1")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(
      result.issues.some((i) => i.message.includes("aggregate outputs"))
    ).toBe(true);
  });
});

describe("analyzeCorrelation – multi-edge list handles", () => {
  it("accepts a multi-edge list with comparable scopes", () => {
    const nodes: NodeDescriptor[] = [
      node("fe", "nodetool.control.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "__execution__", group: "items" }
        }
      }),
      node("a", "test.Pass", {
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "forward", source: "value" }
        }
      }),
      node("b", "test.Pass", {
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "forward", source: "value" }
        }
      }),
      node("sink", "test.Sink", {
        propertyTypes: { items: "list[any]" },
        outputs: { result: "any" },
        output_correlation: {
          result: { kind: "single", source: "__execution__" }
        }
      })
    ];
    const edges: Edge[] = [
      dataEdge("fe", "output", "a", "value", "e1"),
      dataEdge("fe", "output", "b", "value", "e2"),
      dataEdge("a", "value", "sink", "items", "e3"),
      dataEdge("b", "value", "sink", "items", "e4")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(result.issues).toEqual([]);
    expect(result.nodes.get("sink")?.inputs.get("items")?.isMultiEdge).toBe(
      true
    );
  });

  it("rejects multiple edges to a non-list handle", () => {
    const nodes: NodeDescriptor[] = [
      node("a", "test.Source", {
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "single", source: "__execution__" }
        }
      }),
      node("b", "test.Source", {
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "single", source: "__execution__" }
        }
      }),
      node("sink", "test.Sink", {
        propertyTypes: { item: "any" },
        outputs: { result: "any" },
        output_correlation: {
          result: { kind: "single", source: "__execution__" }
        }
      })
    ];
    const edges: Edge[] = [
      dataEdge("a", "value", "sink", "item", "e1"),
      dataEdge("b", "value", "sink", "item", "e2")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(
      result.issues.some((i) =>
        i.message.includes("not a list type")
      )
    ).toBe(true);
  });
});

describe("analyzeCorrelation – buffered repeats_per_key validation", () => {
  it("rejects two repeats_per_key inputs at the execution scope", () => {
    const nodes: NodeDescriptor[] = [
      node("llm1", "test.LLM", {
        outputs: { chunk: "any" },
        output_correlation: {
          chunk: { kind: "chunk", source: "__execution__" }
        }
      }),
      node("llm2", "test.LLM", {
        outputs: { chunk: "any" },
        output_correlation: {
          chunk: { kind: "chunk", source: "__execution__" }
        }
      }),
      node("bad", "test.Combine", {
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "single", source: "__execution__" }
        }
      })
    ];
    const edges: Edge[] = [
      dataEdge("llm1", "chunk", "bad", "left", "e1"),
      dataEdge("llm2", "chunk", "bad", "right", "e2")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(
      result.issues.some((i) =>
        i.message.includes("more than one repeats_per_key")
      )
    ).toBe(true);
  });
});

describe("analyzeCorrelation – validation errors", () => {
  it("rejects forward outputs that use __execution__", () => {
    const nodes: NodeDescriptor[] = [
      node("bad", "test.Bad", {
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "forward", source: "__execution__" }
        }
      })
    ];
    const result = analyzeCorrelation({ nodes, edges: [] });
    expect(
      result.issues.some((i) =>
        i.message.includes('forward outputs may not use source "__execution__"')
      )
    ).toBe(true);
  });

  it("rejects cycles in the data graph", () => {
    const nodes: NodeDescriptor[] = [
      node("a", "test.X", {
        outputs: { value: "any" },
        output_correlation: { value: { kind: "single", source: "x" } }
      }),
      node("b", "test.X", {
        outputs: { value: "any" },
        output_correlation: { value: { kind: "single", source: "x" } }
      })
    ];
    const edges: Edge[] = [
      dataEdge("a", "value", "b", "x", "e1"),
      dataEdge("b", "value", "a", "x", "e2")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(result.issues[0].message).toMatch(/Cycle detected/);
  });
});

describe("edgeKey", () => {
  it("uses edge.id when present, synthetic otherwise", () => {
    expect(edgeKey({ id: "saved", source: "a", sourceHandle: "o", target: "b", targetHandle: "i" })).toBe(
      "saved"
    );
    expect(
      edgeKey({ source: "a", sourceHandle: "o", target: "b", targetHandle: "i" })
    ).toBe("a:o->b:i");
  });
});
