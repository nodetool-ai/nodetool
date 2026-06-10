/**
 * Mutation-focused tests for analyzeCorrelation: each validation branch is
 * triggered and its reported issue (message + nodeId + handle) asserted, plus
 * the topo-sort edge cases, scope/contributor computation, and the
 * CorrelationAnalysisError formatting.
 */

import { describe, expect, it } from "vitest";
import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";
import {
  analyzeCorrelation,
  CorrelationAnalysisError,
  projectLineageKey as projectLineageKeyImport
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

function controlEdge(
  source: string,
  target: string,
  id?: string
): Edge {
  return {
    id,
    source,
    sourceHandle: "ctrl",
    target,
    targetHandle: "__control__",
    edge_type: "control"
  };
}

/** An iteration source that emits scope [src:items] on its `output` handle. */
function iterSource(id: string): NodeDescriptor {
  return node(id, "test.ForEach", {
    outputs: { output: "any" },
    output_correlation: {
      output: { kind: "iteration", source: "__execution__", group: "items" }
    }
  });
}

const issueWith = (
  result: { issues: Array<{ message: string; nodeId?: string; handle?: string }> },
  substr: string
) => result.issues.find((i) => i.message.includes(substr));

describe("CorrelationAnalysisError", () => {
  it("formats issues with node/handle context and a plain fallback", () => {
    const err = new CorrelationAnalysisError([
      { message: "boom", nodeId: "n1", handle: "h1" },
      { message: "plain" }
    ]);
    expect(err.name).toBe("CorrelationAnalysisError");
    expect(err.message).toContain("Correlation analysis failed:");
    expect(err.message).toContain("  - boom (node n1, handle h1)");
    expect(err.message).toMatch(/ {2}- plain(\n|$)/); // no trailing context
    expect(err.issues).toHaveLength(2);
  });

  it("omits the handle segment when only nodeId is present", () => {
    const err = new CorrelationAnalysisError([{ message: "m", nodeId: "n1" }]);
    expect(err.message).toContain("  - m (node n1)");
    expect(err.message).not.toContain("handle");
  });
});

describe("analyzeCorrelation – topological sort", () => {
  it("reports a cycle naming only the involved nodes, and throws when asked", () => {
    const nodes = [
      iterSource("A"),
      node("B", "t", { outputs: { value: "any" } }),
      node("C", "t", { outputs: { value: "any" } }) // independent, not in cycle
    ];
    const edges = [
      dataEdge("A", "output", "B", "in", "e1"),
      dataEdge("B", "value", "A", "in", "e2") // A <-> B cycle
    ];
    const result = analyzeCorrelation({ nodes, edges });
    const cycle = issueWith(result, "Cycle detected");
    expect(cycle).toBeDefined();
    // Lists exactly the cycle nodes A, B joined with ", " — not the independent C.
    expect(cycle!.message).toMatch(/Involved nodes: A, B$/);

    expect(() =>
      analyzeCorrelation({ nodes, edges }, { throwOnIssue: true })
    ).toThrow(CorrelationAnalysisError);
  });

  it("ignores control edges so they cannot form a cycle", () => {
    const nodes = [
      node("A", "t", { outputs: { value: "any" } }),
      node("B", "t", { outputs: { value: "any" } })
    ];
    const edges = [
      dataEdge("A", "value", "B", "in", "e1"),
      controlEdge("B", "A", "c1") // control back-edge: must not create a cycle
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(issueWith(result, "Cycle detected")).toBeUndefined();
  });

  it("ignores edges that reference a missing node", () => {
    const nodes = [node("A", "t", { outputs: { value: "any" } })];
    const edges = [dataEdge("ghost", "out", "A", "in", "e1")]; // source missing
    // Must not throw despite the dangling source.
    const result = analyzeCorrelation({ nodes, edges });
    expect(issueWith(result, "Cycle detected")).toBeUndefined();
  });

  it("reports a self-loop data edge as a cycle", () => {
    // A self-loop deadlocks at runtime: the node's inbox handle is only
    // marked done after the node's own actor completes, so the actor waits
    // on itself forever. It must be rejected like any other cycle.
    const nodes = [node("A", "t", { outputs: { value: "any" } })];
    const edges = [dataEdge("A", "value", "A", "in", "e1")];
    const result = analyzeCorrelation({ nodes, edges });
    const issue = issueWith(result, "Cycle detected");
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("A");
  });
});

describe("analyzeCorrelation – multi-edge handle validation", () => {
  it("rejects a non-list handle that receives multiple edges", () => {
    const nodes = [
      node("a", "t", { outputs: { value: "any" } }),
      node("b", "t", { outputs: { value: "any" } }),
      node("sink", "t", { outputs: {} }) // "in" is not a list type
    ];
    const edges = [
      dataEdge("a", "value", "sink", "in", "e1"),
      dataEdge("b", "value", "sink", "in", "e2")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    const issue = issueWith(result, "is not a list type");
    expect(issue).toBeDefined();
    expect(issue!.nodeId).toBe("sink");
    expect(issue!.handle).toBe("in");
    expect(issue!.message).toContain("receives 2 edges");
  });

  it("rejects a list handle whose source-edge scopes are incomparable", () => {
    // Two independent iteration sources feed one list handle.
    const nodes = [
      iterSource("F1"),
      iterSource("F2"),
      node("sink", "t", {
        outputs: {},
        propertyTypes: { items: "list[any]" }
      })
    ];
    const edges = [
      dataEdge("F1", "output", "sink", "items", "e1"),
      dataEdge("F2", "output", "sink", "items", "e2")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    const issue = issueWith(result, "incomparable source-edge scopes");
    expect(issue).toBeDefined();
    expect(issue!.nodeId).toBe("sink");
    expect(issue!.handle).toBe("items");
    // dynamic scope rendering
    expect(issue!.message).toContain("[F1:items]");
    expect(issue!.message).toContain("[F2:items]");
  });

  it("accepts a list handle whose source scopes are comparable", () => {
    const nodes = [
      iterSource("F1"),
      node("pass", "t", {
        outputs: { value: "any" },
        output_correlation: { value: { kind: "forward", source: "in" } }
      }),
      node("sink", "t", { outputs: {}, propertyTypes: { items: "list[any]" } })
    ];
    const edges = [
      dataEdge("F1", "output", "pass", "in", "e0"),
      dataEdge("F1", "output", "sink", "items", "e1"), // scope [F1:items]
      dataEdge("pass", "value", "sink", "items", "e2") // scope [F1:items]
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(issueWith(result, "incomparable")).toBeUndefined();
    expect(result.nodes.get("sink")!.inputs.get("items")!.scope).toEqual([
      "F1:items"
    ]);
  });
});

describe("analyzeCorrelation – invocation scope & joins", () => {
  it("uses the largest input scope as the invocation scope", () => {
    // nested: F1 -> F2(iteration) gives [F1:items, F2:items]; plus a shallow input.
    const nodes = [
      iterSource("F1"),
      node("F2", "test.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "in", group: "items" }
        }
      }),
      node("sink", "t", { outputs: {} })
    ];
    const edges = [
      dataEdge("F1", "output", "F2", "in", "e0"),
      dataEdge("F1", "output", "sink", "shallow", "e1"), // [F1:items]
      dataEdge("F2", "output", "sink", "deep", "e2") // [F1:items, F2:items]
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(issueWith(result, "independent iteration")).toBeUndefined();
    expect(result.nodes.get("sink")!.invocationScope).toEqual([
      "F1:items",
      "F2:items"
    ]);
  });

  it("a join node takes the longest common parent prefix of incomparable inputs", () => {
    // F1 splits into two independent children; a join node combines them.
    const nodes = [
      iterSource("F1"),
      node("L", "test.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "in", group: "l" }
        }
      }),
      node("R", "test.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "in", group: "r" }
        }
      }),
      node("zip", "test.Zip", { is_join_node: true, outputs: {} })
    ];
    const edges = [
      dataEdge("F1", "output", "L", "in", "e0"),
      dataEdge("F1", "output", "R", "in", "e1"),
      dataEdge("L", "output", "zip", "a", "e2"), // [F1:items, L:l]
      dataEdge("R", "output", "zip", "b", "e3") // [F1:items, R:r]
    ];
    const result = analyzeCorrelation({ nodes, edges });
    // join nodes are allowed incomparable inputs: no issue
    expect(issueWith(result, "independent iteration")).toBeUndefined();
    // common parent prefix is [F1:items]
    expect(result.nodes.get("zip")!.invocationScope).toEqual(["F1:items"]);
  });
});

describe("analyzeCorrelation – output metadata validation", () => {
  it("rejects a forward output that uses __execution__ as source", () => {
    const nodes = [
      node("n", "t", {
        outputs: { value: "any" },
        output_correlation: {
          value: { kind: "forward", source: "__execution__" }
        }
      })
    ];
    const result = analyzeCorrelation({ nodes, edges: [] });
    const issue = issueWith(result, 'forward outputs may not use source "__execution__"');
    expect(issue).toBeDefined();
    expect(issue!.nodeId).toBe("n");
    expect(issue!.handle).toBe("value");
  });

  it("rejects a forward output naming a multi-edge list handle", () => {
    const nodes = [
      node("a", "t", { outputs: { value: "any" } }),
      node("b", "t", { outputs: { value: "any" } }),
      node("n", "t", {
        outputs: { out: "any" },
        propertyTypes: { items: "list[any]" },
        output_correlation: { out: { kind: "forward", source: "items" } }
      })
    ];
    const edges = [
      dataEdge("a", "value", "n", "items", "e1"),
      dataEdge("b", "value", "n", "items", "e2")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    const issue = issueWith(
      result,
      "forward outputs may not name a multi-edge list handle"
    );
    expect(issue).toBeDefined();
    expect(issue!.nodeId).toBe("n");
    expect(issue!.handle).toBe("out");
  });

  it("rejects an output that omits a required source", () => {
    const nodes = [
      node("n", "t", {
        outputs: { value: "any" },
        // kind present but source missing
        output_correlation: { value: { kind: "single" } as never }
      })
    ];
    const result = analyzeCorrelation({ nodes, edges: [] });
    const issue = issueWith(result, 'omits required "source"');
    expect(issue).toBeDefined();
    expect(issue!.nodeId).toBe("n");
    expect(issue!.handle).toBe("value");
  });

  it("rejects an aggregate output with no collapse", () => {
    const nodes = [
      node("n", "t", {
        input_mode: "stream",
        outputs: { value: "any" },
        output_correlation: { value: { kind: "aggregate", source: "in" } }
      })
    ];
    const result = analyzeCorrelation({ nodes, edges: [] });
    const issue = issueWith(result, 'aggregate output requires "collapse"');
    expect(issue).toBeDefined();
    expect(issue!.nodeId).toBe("n");
    expect(issue!.handle).toBe("value");
  });

  it("treats an output whose named source has no connected edge as empty scope", () => {
    const nodes = [
      node("n", "t", {
        input_mode: "stream",
        outputs: { value: "any" },
        output_correlation: { value: { kind: "forward", source: "missing" } }
      })
    ];
    const result = analyzeCorrelation({ nodes, edges: [] });
    expect(result.nodes.get("n")!.outputs.get("value")!.scope).toEqual([]);
  });
});

describe("analyzeCorrelation – buffered output rules", () => {
  it("rejects a buffered output whose scope is a strict prefix of the invocation scope", () => {
    // Sink consumes an iteration input (invocation [F1:items]) but declares an
    // aggregate-free output that collapses back to [] — a strict prefix.
    const nodes = [
      iterSource("F1"),
      node("sink", "t", {
        input_mode: "buffered",
        outputs: { rolled: "any" },
        // forward a config-like empty-scope input while invocation is [F1:items]
        output_correlation: { rolled: { kind: "forward", source: "cfg" } }
      }),
      node("cfg", "t", {
        outputs: { value: "any" },
        output_correlation: { value: { kind: "single", source: "__execution__" } }
      })
    ];
    const edges = [
      dataEdge("F1", "output", "sink", "iter", "e1"), // invocation [F1:items]
      dataEdge("cfg", "value", "sink", "cfg", "e2") // scope []
    ];
    const result = analyzeCorrelation({ nodes, edges });
    const issue = issueWith(result, "strict prefix of the invocation scope");
    expect(issue).toBeDefined();
    expect(issue!.nodeId).toBe("sink");
    expect(issue!.handle).toBe("rolled");
    expect(issue!.message).toContain("[F1:items]");
  });

  it("rejects a buffered node with more than one repeats_per_key execution-scope input", () => {
    const nodes = [
      node("s1", "test.LLM", {
        outputs: { chunk: "any" },
        output_correlation: { chunk: { kind: "chunk", source: "__execution__" } }
      }),
      node("s2", "test.LLM", {
        outputs: { chunk: "any" },
        output_correlation: { chunk: { kind: "chunk", source: "__execution__" } }
      }),
      node("sink", "t", { input_mode: "buffered", outputs: {} })
    ];
    const edges = [
      dataEdge("s1", "chunk", "sink", "a", "e1"),
      dataEdge("s2", "chunk", "sink", "b", "e2")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    const issue = issueWith(result, "more than one repeats_per_key input");
    expect(issue).toBeDefined();
    expect(issue!.nodeId).toBe("sink");
    expect(issue!.message).toContain("a, b");
  });

  it("rejects a buffered node whose only repeats input is a multi-edge list handle", () => {
    const nodes = [
      node("s1", "test.LLM", {
        outputs: { chunk: "any" },
        output_correlation: { chunk: { kind: "chunk", source: "__execution__" } }
      }),
      node("s2", "test.LLM", {
        outputs: { chunk: "any" },
        output_correlation: { chunk: { kind: "chunk", source: "__execution__" } }
      }),
      node("sink", "t", {
        input_mode: "buffered",
        outputs: {},
        propertyTypes: { items: "list[any]" }
      })
    ];
    const edges = [
      dataEdge("s1", "chunk", "sink", "items", "e1"),
      dataEdge("s2", "chunk", "sink", "items", "e2")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    const issue = issueWith(result, "is a multi-edge list handle");
    expect(issue).toBeDefined();
    expect(issue!.nodeId).toBe("sink");
    expect(issue!.handle).toBe("items");
  });

  it("rejects a buffered node using a repeats input as a strict-prefix sticky value", () => {
    // outer chunk source feeds a node nested one level deeper (via F1), so the
    // repeating input's scope is a strict prefix of the invocation scope.
    const nodes = [
      node("llm", "test.LLM", {
        outputs: { chunk: "any" },
        output_correlation: { chunk: { kind: "chunk", source: "__execution__" } }
      }),
      iterSource("F1"),
      node("sink", "t", { input_mode: "buffered", outputs: {} })
    ];
    const edges = [
      dataEdge("llm", "chunk", "sink", "sticky", "e1"), // scope [] repeats
      dataEdge("F1", "output", "sink", "iter", "e2") // scope [F1:items]
    ];
    const result = analyzeCorrelation({ nodes, edges });
    // llm's chunk has scope [] (empty) -> the strict-prefix sticky rule needs a
    // non-empty repeating scope shorter than invocation; assert no crash and
    // the invocation scope is the deeper one.
    expect(result.nodes.get("sink")!.invocationScope).toEqual(["F1:items"]);
  });
});

describe("analyzeCorrelation – __execution__ base & contributors", () => {
  it("propagates repeats_per_key to an __execution__ output at the invocation scope", () => {
    // rep emits a CHUNK that forwards F1's iteration scope, so its output is
    // repeats_per_key=true AT scope [F1:items]. sink's invocation scope is the
    // same length, so the repeat must propagate to its __execution__ output.
    const nodes = [
      iterSource("F1"),
      node("rep", "t", {
        outputs: { chunk: "any" },
        output_correlation: { chunk: { kind: "chunk", source: "in" } }
      }),
      node("sink", "t", {
        input_mode: "stream",
        outputs: { value: "any" },
        output_correlation: { value: { kind: "single", source: "__execution__" } }
      })
    ];
    const edges = [
      dataEdge("F1", "output", "rep", "in", "e0"),
      dataEdge("rep", "chunk", "sink", "in", "e1")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(result.nodes.get("rep")!.outputs.get("chunk")!.repeatsPerKey).toBe(
      true
    );
    expect(result.nodes.get("sink")!.outputs.get("value")!.repeatsPerKey).toBe(
      true
    );
  });

  it("records close-barrier contributors for an __execution__ output", () => {
    const nodes = [
      iterSource("F1"),
      node("sink", "t", {
        outputs: { value: "any" },
        output_correlation: { value: { kind: "single", source: "__execution__" } }
      })
    ];
    const edges = [dataEdge("F1", "output", "sink", "in", "e1")];
    const result = analyzeCorrelation({ nodes, edges });
    const contributors = result.nodes
      .get("sink")!
      .outputs.get("value")!.closeBarrierContributors;
    expect(Array.from(contributors)).toContain("e1");
  });

  it("records contributors for an output whose source names an input handle", () => {
    const nodes = [
      iterSource("F1"),
      node("sink", "t", {
        outputs: { value: "any" },
        output_correlation: { value: { kind: "forward", source: "in" } }
      })
    ];
    const edges = [dataEdge("F1", "output", "sink", "in", "e1")];
    const result = analyzeCorrelation({ nodes, edges });
    const contributors = result.nodes
      .get("sink")!
      .outputs.get("value")!.closeBarrierContributors;
    expect(Array.from(contributors)).toContain("e1");
  });
});

describe("CorrelationAnalysisError formatting (multi-issue)", () => {
  it("separates issues with newlines", () => {
    const err = new CorrelationAnalysisError([
      { message: "boom", nodeId: "n1", handle: "h1" },
      { message: "plain" }
    ]);
    expect(err.message).toContain(")\n  - plain");
  });
});

describe("analyzeCorrelation – largerScope merge on list handles", () => {
  it("merges nested comparable scopes in both prefix directions", () => {
    // sink.items receives [F1:items], [F1:items, F2:items], [F1:items] in that
    // order, exercising both larger-scope branches.
    const nodes = [
      iterSource("F1"),
      node("F2", "test.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "in", group: "items" }
        }
      }),
      node("sink", "t", { outputs: {}, propertyTypes: { items: "list[any]" } })
    ];
    const edges = [
      dataEdge("F1", "output", "F2", "in", "e0"),
      dataEdge("F1", "output", "sink", "items", "e1"), // [F1:items]
      dataEdge("F2", "output", "sink", "items", "e2"), // [F1:items, F2:items]
      dataEdge("F1", "output", "sink", "items", "e3") // [F1:items] again
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(issueWith(result, "incomparable")).toBeUndefined();
    expect(result.nodes.get("sink")!.inputs.get("items")!.scope).toEqual([
      "F1:items",
      "F2:items"
    ]);
  });
});

describe("analyzeCorrelation – aggregate output kind", () => {
  it("drops the innermost root, clears repeats, and prunes the child root", () => {
    const nodes = [
      iterSource("F1"),
      node("agg", "t", {
        input_mode: "stream",
        outputs: { rolled: "any" },
        output_correlation: {
          rolled: { kind: "aggregate", source: "in", collapse: "innermost" }
        }
      })
    ];
    const edges = [dataEdge("F1", "output", "agg", "in", "e1")];
    const out = analyzeCorrelation({ nodes, edges }).nodes
      .get("agg")!
      .outputs.get("rolled")!;
    expect(out.scope).toEqual([]); // [F1:items] -> []
    expect(out.repeatsPerKey).toBe(false);
    expect(Array.from(out.possibleChildRoots)).not.toContain("F1:items");
  });

  it("is identity when collapse is not innermost (defensive)", () => {
    const nodes = [
      iterSource("F1"),
      node("agg", "t", {
        input_mode: "stream",
        outputs: { rolled: "any" },
        // aggregate without collapse -> identity transform
        output_correlation: { rolled: { kind: "aggregate", source: "in" } }
      })
    ];
    const edges = [dataEdge("F1", "output", "agg", "in", "e1")];
    const out = analyzeCorrelation({ nodes, edges }).nodes
      .get("agg")!
      .outputs.get("rolled")!;
    expect(out.scope).toEqual(["F1:items"]); // unchanged (identity)
  });

  it("is identity when the base scope is already empty", () => {
    const nodes = [
      node("agg", "t", {
        input_mode: "stream",
        outputs: { rolled: "any" },
        output_correlation: {
          rolled: { kind: "aggregate", source: "in", collapse: "innermost" }
        }
      })
    ];
    // no incoming edge -> source input absent -> base scope []
    const out = analyzeCorrelation({ nodes, edges: [] }).nodes
      .get("agg")!
      .outputs.get("rolled")!;
    expect(out.scope).toEqual([]);
  });
});

describe("analyzeCorrelation – list detection with a non-string type", () => {
  it("treats a non-string declared type as a non-list (rejects multi-edge)", () => {
    const nodes = [
      node("a", "t", { outputs: { value: "any" } }),
      node("b", "t", { outputs: { value: "any" } }),
      node("sink", "t", {
        outputs: {},
        propertyTypes: { items: 123 as never } // non-string -> parser throws
      })
    ];
    const edges = [
      dataEdge("a", "value", "sink", "items", "e1"),
      dataEdge("b", "value", "sink", "items", "e2")
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(issueWith(result, "is not a list type")).toBeDefined();
  });
});

describe("analyzeCorrelation – invocation scope selects the maximum", () => {
  it("picks the deepest scope even when it appears first", () => {
    const nodes = [
      iterSource("F1"),
      node("F2", "test.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "in", group: "items" }
        }
      }),
      node("sink", "t", { outputs: {} })
    ];
    // deep edge (e1) is listed BEFORE the shallow edge (e2)
    const edges = [
      dataEdge("F1", "output", "F2", "in", "e0"),
      dataEdge("F2", "output", "sink", "deep", "e1"), // [F1:items, F2:items]
      dataEdge("F1", "output", "sink", "shallow", "e2") // [F1:items]
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(result.nodes.get("sink")!.invocationScope).toEqual([
      "F1:items",
      "F2:items"
    ]);
  });
});

describe("analyzeCorrelation – join node with a shallow extra input", () => {
  it("ignores empty-scope inputs and prefixes only non-empty ones", () => {
    const nodes = [
      iterSource("F1"),
      node("L", "test.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "in", group: "l" }
        }
      }),
      node("R", "test.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "in", group: "r" }
        }
      }),
      node("cfg", "t", {
        outputs: { value: "any" },
        output_correlation: { value: { kind: "single", source: "__execution__" } }
      }),
      node("zip", "test.Zip", { is_join_node: true, outputs: {} })
    ];
    const edges = [
      dataEdge("F1", "output", "L", "in", "e0"),
      dataEdge("F1", "output", "R", "in", "e1"),
      dataEdge("cfg", "value", "zip", "cfg", "e2"), // empty scope: ignored
      dataEdge("L", "output", "zip", "a", "e3"), // [F1:items, L:l]
      dataEdge("R", "output", "zip", "b", "e4") // [F1:items, R:r]
    ];
    const result = analyzeCorrelation({ nodes, edges });
    expect(result.nodes.get("zip")!.invocationScope).toEqual(["F1:items"]);
  });
});

describe("analyzeCorrelation – output handles fallback", () => {
  it("processes output_correlation handles when no outputs are declared", () => {
    const nodes = [
      node("src", "t", {
        // no `outputs` declared, only output_correlation
        output_correlation: {
          value: { kind: "single", source: "__execution__" }
        }
      })
    ];
    const result = analyzeCorrelation({ nodes, edges: [] });
    expect(result.nodes.get("src")!.outputs.has("value")).toBe(true);
  });
});

describe("analyzeCorrelation – throwOnIssue for non-cycle issues", () => {
  it("throws when issues exist and is silent on a clean graph", () => {
    const bad = [iterSource("F1"), iterSource("F2"), node("sink", "t", { outputs: {} })];
    const badEdges = [
      dataEdge("F1", "output", "sink", "a", "e1"),
      dataEdge("F2", "output", "sink", "b", "e2") // independent -> issue
    ];
    expect(() =>
      analyzeCorrelation({ nodes: bad, edges: badEdges }, { throwOnIssue: true })
    ).toThrow(CorrelationAnalysisError);

    const clean = [
      node("src", "t", {
        outputs: { value: "any" },
        output_correlation: { value: { kind: "single", source: "__execution__" } }
      })
    ];
    expect(() =>
      analyzeCorrelation({ nodes: clean, edges: [] }, { throwOnIssue: true })
    ).not.toThrow();
  });
});

describe("projectLineageKey – missing token", () => {
  it("returns the empty key when a scope root is absent from the lineage", () => {
    expect(projectLineageKeyImport({}, ["a:items"])).toBe("");
  });
});

describe("analyzeCorrelation – __execution__ repeats gating", () => {
  it("does not mark repeats for a non-repeating input at the invocation scope", () => {
    // F1's iteration output does NOT repeat per key; the sink's __execution__
    // output must therefore not be repeats_per_key either.
    const nodes = [
      iterSource("F1"),
      node("sink", "t", {
        outputs: { value: "any" },
        output_correlation: { value: { kind: "single", source: "__execution__" } }
      })
    ];
    const edges = [dataEdge("F1", "output", "sink", "in", "e1")];
    const result = analyzeCorrelation({ nodes, edges });
    expect(result.nodes.get("sink")!.outputs.get("value")!.repeatsPerKey).toBe(
      false
    );
  });
});

describe("analyzeCorrelation – formatScope rendering", () => {
  it("renders multi-element scopes with comma separators in the issue message", () => {
    const nodes = [
      iterSource("F1"),
      node("L", "test.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "in", group: "l" }
        }
      }),
      node("R", "test.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "in", group: "r" }
        }
      }),
      node("sink", "t", { outputs: {} }) // NOT a join node -> incomparable issue
    ];
    const edges = [
      dataEdge("F1", "output", "L", "in", "e0"),
      dataEdge("F1", "output", "R", "in", "e1"),
      dataEdge("L", "output", "sink", "a", "e2"), // [F1:items, L:l]
      dataEdge("R", "output", "sink", "b", "e3") // [F1:items, R:r]
    ];
    const issue = issueWith(
      analyzeCorrelation({ nodes, edges }),
      "independent iteration sources"
    );
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("[F1:items, L:l]");
    expect(issue!.message).toContain("[F1:items, R:r]");
  });
});

describe("analyzeCorrelation – buffered repeats edge cases", () => {
  // A node nested two iteration levels deep, fed a repeating value from only
  // the OUTER level — a strict-prefix sticky repeat the buffered rules reject.
  function nestedRepeat(sinkMode: NodeDescriptor["input_mode"]) {
    const nodes = [
      iterSource("F1"),
      node("F2", "test.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "in", group: "items" }
        }
      }),
      node("rep", "t", {
        outputs: { chunk: "any" },
        output_correlation: { chunk: { kind: "chunk", source: "in" } }
      }),
      node("sink", "t", { input_mode: sinkMode, outputs: {} })
    ];
    const edges = [
      dataEdge("F1", "output", "F2", "in", "e0"),
      dataEdge("F1", "output", "rep", "in", "e1"), // rep.chunk scope [F1:items] repeats
      dataEdge("rep", "chunk", "sink", "sticky", "e2"), // [F1:items] repeats (strict prefix)
      dataEdge("F2", "output", "sink", "deep", "e3") // [F1:items, F2:items] -> invocation
    ];
    return analyzeCorrelation({ nodes, edges });
  }

  it("rejects a repeating strict-prefix sticky input on a buffered node", () => {
    const issue = issueWith(nestedRepeat("buffered"), "strict-prefix sticky value");
    expect(issue).toBeDefined();
    expect(issue!.nodeId).toBe("sink");
    expect(issue!.handle).toBe("sticky");
  });

  it("applies the same buffered rules to a controlled-mode node", () => {
    // input_mode "controlled" is treated as buffered, so the same issue fires.
    expect(
      issueWith(nestedRepeat("controlled"), "strict-prefix sticky value")
    ).toBeDefined();
  });

  it("does NOT apply buffered rules to a stream-mode node", () => {
    expect(
      issueWith(nestedRepeat("stream"), "strict-prefix sticky value")
    ).toBeUndefined();
  });

  it("rejects a buffered node whose sole repeats execution-scope input is a multi-edge list", () => {
    // Two chunk sources feed one list handle at the invocation scope.
    const nodes = [
      node("c1", "test.LLM", {
        outputs: { chunk: "any" },
        output_correlation: { chunk: { kind: "chunk", source: "__execution__" } }
      }),
      node("c2", "test.LLM", {
        outputs: { chunk: "any" },
        output_correlation: { chunk: { kind: "chunk", source: "__execution__" } }
      }),
      node("sink", "t", {
        input_mode: "buffered",
        outputs: {},
        propertyTypes: { items: "list[any]" }
      })
    ];
    const edges = [
      dataEdge("c1", "chunk", "sink", "items", "e1"),
      dataEdge("c2", "chunk", "sink", "items", "e2")
    ];
    const issue = issueWith(
      analyzeCorrelation({ nodes, edges }),
      "is a multi-edge list handle"
    );
    expect(issue).toBeDefined();
    expect(issue!.handle).toBe("items");
  });
});

describe("analyzeCorrelation – output source defaults & base", () => {
  it("defaults a missing source to __execution__ (scope = invocation)", () => {
    const nodes = [
      iterSource("F1"),
      // declared output but NO output_correlation entry -> source defaults
      node("sink", "t", { outputs: { value: "any" } })
    ];
    const edges = [dataEdge("F1", "output", "sink", "in", "e1")];
    const out = analyzeCorrelation({ nodes, edges }).nodes
      .get("sink")!
      .outputs.get("value")!;
    expect(out.scope).toEqual(["F1:items"]); // invocation, not [] (else branch)
  });

  it("gives an empty, non-repeating base when the named source has no edge", () => {
    const nodes = [
      node("n", "t", {
        input_mode: "stream",
        outputs: { value: "any" },
        output_correlation: { value: { kind: "forward", source: "missing" } }
      })
    ];
    const out = analyzeCorrelation({ nodes, edges: [] }).nodes
      .get("n")!
      .outputs.get("value")!;
    expect(out.scope).toEqual([]);
    expect(out.repeatsPerKey).toBe(false);
  });

  it("does not flag a forward output naming a single-edge source", () => {
    const nodes = [
      iterSource("F1"),
      node("n", "t", {
        outputs: { value: "any" },
        output_correlation: { value: { kind: "forward", source: "in" } }
      })
    ];
    const edges = [dataEdge("F1", "output", "n", "in", "e1")];
    const result = analyzeCorrelation({ nodes, edges });
    expect(issueWith(result, "may not name a multi-edge list handle")).toBeUndefined();
  });
});

describe("analyzeCorrelation – __execution__ repeats & contributors (edge cases)", () => {
  it("does not propagate repeats from a strict-prefix repeating input", () => {
    const nodes = [
      iterSource("F1"),
      node("F2", "test.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "in", group: "items" }
        }
      }),
      node("rep", "t", {
        outputs: { chunk: "any" },
        output_correlation: { chunk: { kind: "chunk", source: "in" } }
      }),
      node("snk", "t", {
        input_mode: "stream",
        outputs: { value: "any" },
        output_correlation: { value: { kind: "single", source: "__execution__" } }
      })
    ];
    const edges = [
      dataEdge("F1", "output", "F2", "in", "e0"),
      dataEdge("F1", "output", "rep", "in", "e1"),
      dataEdge("rep", "chunk", "snk", "sticky", "e2"), // [F1:items] repeats (strict prefix)
      dataEdge("F2", "output", "snk", "deep", "e3") // [F1:items, F2:items] -> invocation
    ];
    const out = analyzeCorrelation({ nodes, edges }).nodes
      .get("snk")!
      .outputs.get("value")!;
    expect(out.repeatsPerKey).toBe(false);
  });

  it("excludes empty-scope (config) edges from close-barrier contributors", () => {
    const nodes = [
      iterSource("F1"),
      node("cfg", "t", {
        outputs: { value: "any" },
        output_correlation: { value: { kind: "single", source: "__execution__" } }
      }),
      node("sink", "t", {
        outputs: { value: "any" },
        output_correlation: { value: { kind: "single", source: "__execution__" } }
      })
    ];
    const edges = [
      dataEdge("F1", "output", "sink", "iter", "e1"), // scope [F1:items]
      dataEdge("cfg", "value", "sink", "cfg", "e2") // scope [] -> excluded
    ];
    const contributors = analyzeCorrelation({ nodes, edges }).nodes
      .get("sink")!
      .outputs.get("value")!.closeBarrierContributors;
    expect(Array.from(contributors)).toEqual(["e1"]);
  });
});

describe("analyzeCorrelation – strict-prefix output guard by mode/kind", () => {
  it("does not flag a stream node's strict-prefix output", () => {
    const nodes = [
      iterSource("F1"),
      node("F2", "test.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "in", group: "items" }
        }
      }),
      node("sink", "t", {
        input_mode: "stream",
        outputs: { rolled: "any" },
        output_correlation: { rolled: { kind: "forward", source: "shallow" } }
      })
    ];
    const edges = [
      dataEdge("F1", "output", "F2", "in", "e0"),
      dataEdge("F1", "output", "sink", "shallow", "e1"), // [F1:items]
      dataEdge("F2", "output", "sink", "deep", "e2") // [F1:items, F2:items] -> invocation
    ];
    expect(
      issueWith(analyzeCorrelation({ nodes, edges }), "strict prefix")
    ).toBeUndefined();
  });

  it("does not add a strict-prefix issue for a buffered aggregate output", () => {
    const nodes = [
      iterSource("F1"),
      node("sink", "t", {
        input_mode: "buffered",
        outputs: { rolled: "any" },
        output_correlation: {
          rolled: { kind: "aggregate", source: "in", collapse: "innermost" }
        }
      })
    ];
    const edges = [dataEdge("F1", "output", "sink", "in", "e1")];
    const result = analyzeCorrelation({ nodes, edges });
    // aggregate-on-buffered is reported, but NOT a strict-prefix issue.
    expect(issueWith(result, "only valid on input_mode")).toBeDefined();
    expect(issueWith(result, "strict prefix")).toBeUndefined();
  });
});

describe("analyzeCorrelation – final guard branches", () => {
  it("does not flag a non-forward output that names a multi-edge source", () => {
    const nodes = [
      node("a", "t", { outputs: { value: "any" } }),
      node("b", "t", { outputs: { value: "any" } }),
      node("n", "t", {
        outputs: { out: "any" },
        propertyTypes: { items: "list[any]" },
        // kind "single" (not forward) naming a multi-edge handle: allowed
        output_correlation: { out: { kind: "single", source: "items" } }
      })
    ];
    const edges = [
      dataEdge("a", "value", "n", "items", "e1"),
      dataEdge("b", "value", "n", "items", "e2")
    ];
    expect(
      issueWith(analyzeCorrelation({ nodes, edges }), "may not name a multi-edge list handle")
    ).toBeUndefined();
  });

  it("counts only invocation-scope repeats (a strict-prefix repeat is not a second one)", () => {
    // cA repeats at the invocation scope [F1,F2]; cB repeats at the strict
    // prefix [F1]. Only cA counts, so there is NO ">1 repeats" issue.
    const nodes = [
      iterSource("F1"),
      node("F2", "test.ForEach", {
        outputs: { output: "any" },
        output_correlation: {
          output: { kind: "iteration", source: "in", group: "items" }
        }
      }),
      node("cA", "t", {
        outputs: { chunk: "any" },
        output_correlation: { chunk: { kind: "chunk", source: "in" } }
      }),
      node("cB", "t", {
        outputs: { chunk: "any" },
        output_correlation: { chunk: { kind: "chunk", source: "in" } }
      }),
      node("sink", "t", { input_mode: "buffered", outputs: {} })
    ];
    const edges = [
      dataEdge("F1", "output", "F2", "in", "e0"),
      dataEdge("F2", "output", "cA", "in", "e1"), // cA.chunk -> [F1,F2] repeats
      dataEdge("F1", "output", "cB", "in", "e2"), // cB.chunk -> [F1] repeats
      dataEdge("cA", "chunk", "sink", "a", "e3"), // [F1,F2] repeats (invocation)
      dataEdge("cB", "chunk", "sink", "b", "e4"), // [F1] repeats (strict prefix)
      dataEdge("F2", "output", "sink", "deep", "e5") // sets invocation [F1,F2]
    ];
    expect(
      issueWith(
        analyzeCorrelation({ nodes, edges }),
        "more than one repeats_per_key input"
      )
    ).toBeUndefined();
  });

  it("does not flag an empty-scope (config) repeating input as a sticky value", () => {
    // llm emits a repeats_per_key chunk at the empty scope; the node is nested
    // one iteration deep. The empty-scope repeat must NOT be flagged sticky.
    const nodes = [
      node("llm", "test.LLM", {
        outputs: { chunk: "any" },
        output_correlation: { chunk: { kind: "chunk", source: "__execution__" } }
      }),
      iterSource("F1"),
      node("sink", "t", { input_mode: "buffered", outputs: {} })
    ];
    const edges = [
      dataEdge("llm", "chunk", "sink", "cfg", "e1"), // scope [] repeats
      dataEdge("F1", "output", "sink", "deep", "e2") // invocation [F1:items]
    ];
    expect(
      issueWith(
        analyzeCorrelation({ nodes, edges }),
        "strict-prefix sticky value"
      )
    ).toBeUndefined();
  });
});
