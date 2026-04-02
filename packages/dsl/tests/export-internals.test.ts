import { describe, test, expect } from "vitest";
import { _testing } from "../src/export.js";

const {
  toCamelCase,
  barrelName,
  extractClassName,
  isValidIdentifier,
  formatKey,
  formatLiteral,
  asRecord,
  normalizeGraph,
  makeIdentifier,
  topologicalSort,
  workflowConstName,
  formatHandleExpression,
  buildCreateNodeOptions
} = _testing;

// ---------------------------------------------------------------------------
// toCamelCase
// ---------------------------------------------------------------------------
describe("toCamelCase", () => {
  test("returns empty string unchanged", () => {
    expect(toCamelCase("")).toBe("");
  });

  test("lowercases a single uppercase char", () => {
    expect(toCamelCase("A")).toBe("a");
  });

  test("lowercases fully uppercase word", () => {
    expect(toCamelCase("HTTP")).toBe("http");
  });

  test("lowers only the first char when it is uppercase", () => {
    expect(toCamelCase("Integer")).toBe("integer");
  });

  test("handles acronym followed by lowercase", () => {
    expect(toCamelCase("HTTPServer")).toBe("httpServer");
  });

  test("returns already-camelCase unchanged", () => {
    expect(toCamelCase("myFunction")).toBe("myFunction");
  });

  test("handles two-char prefix", () => {
    expect(toCamelCase("IOError")).toBe("ioError");
  });

  test("lowercases all-caps two-char string", () => {
    expect(toCamelCase("IO")).toBe("io");
  });
});

// ---------------------------------------------------------------------------
// extractClassName
// ---------------------------------------------------------------------------
describe("extractClassName", () => {
  test("extracts last segment from dotted type", () => {
    expect(extractClassName("nodetool.constant.Integer")).toBe("Integer");
  });

  test("returns single-part type as-is", () => {
    expect(extractClassName("Integer")).toBe("Integer");
  });

  test("handles deeply nested type", () => {
    expect(extractClassName("a.b.c.d.E")).toBe("E");
  });
});

// ---------------------------------------------------------------------------
// barrelName
// ---------------------------------------------------------------------------
describe("barrelName", () => {
  test("strips nodetool. prefix and returns namespace", () => {
    expect(barrelName("nodetool.constant")).toBe("constant");
  });

  test("camelCases multi-segment namespace", () => {
    expect(barrelName("nodetool.text.transform")).toBe("textTransform");
  });

  test("does not strip non-nodetool prefix", () => {
    expect(barrelName("lib.numpy")).toBe("libNumpy");
  });

  test("appends underscore for TS type keywords", () => {
    expect(barrelName("nodetool.string")).toBe("string_");
    expect(barrelName("nodetool.number")).toBe("number_");
    expect(barrelName("nodetool.boolean")).toBe("boolean_");
  });
});

// ---------------------------------------------------------------------------
// isValidIdentifier
// ---------------------------------------------------------------------------
describe("isValidIdentifier", () => {
  test("accepts simple identifiers", () => {
    expect(isValidIdentifier("foo")).toBe(true);
    expect(isValidIdentifier("_bar")).toBe(true);
    expect(isValidIdentifier("$baz")).toBe(true);
    expect(isValidIdentifier("a1")).toBe(true);
  });

  test("rejects identifiers starting with digit", () => {
    expect(isValidIdentifier("1abc")).toBe(false);
  });

  test("rejects empty string", () => {
    expect(isValidIdentifier("")).toBe(false);
  });

  test("rejects strings with spaces", () => {
    expect(isValidIdentifier("foo bar")).toBe(false);
  });

  test("rejects strings with dashes", () => {
    expect(isValidIdentifier("foo-bar")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatKey
// ---------------------------------------------------------------------------
describe("formatKey", () => {
  test("returns valid identifier unquoted", () => {
    expect(formatKey("myKey")).toBe("myKey");
  });

  test("quotes invalid identifiers", () => {
    expect(formatKey("my-key")).toBe('"my-key"');
    expect(formatKey("1start")).toBe('"1start"');
  });
});

// ---------------------------------------------------------------------------
// formatLiteral
// ---------------------------------------------------------------------------
describe("formatLiteral", () => {
  test("formats null", () => {
    expect(formatLiteral(null)).toBe("null");
  });

  test("formats undefined", () => {
    expect(formatLiteral(undefined)).toBe("undefined");
  });

  test("formats strings", () => {
    expect(formatLiteral("hello")).toBe('"hello"');
    expect(formatLiteral('with "quotes"')).toBe('"with \\"quotes\\""');
  });

  test("formats numbers", () => {
    expect(formatLiteral(42)).toBe("42");
    expect(formatLiteral(3.14)).toBe("3.14");
  });

  test("formats booleans", () => {
    expect(formatLiteral(true)).toBe("true");
    expect(formatLiteral(false)).toBe("false");
  });

  test("formats empty array", () => {
    expect(formatLiteral([])).toBe("[]");
  });

  test("formats array with items", () => {
    const result = formatLiteral([1, 2]);
    expect(result).toContain("1");
    expect(result).toContain("2");
    expect(result).toMatch(/^\[/);
  });

  test("formats empty object", () => {
    expect(formatLiteral({})).toBe("{}");
  });

  test("formats object with entries", () => {
    const result = formatLiteral({ a: 1, b: "x" });
    expect(result).toContain("a: 1");
    expect(result).toContain('b: "x"');
  });

  test("formats nested structures", () => {
    const result = formatLiteral({ items: [1, 2], nested: { x: true } });
    expect(result).toContain("items:");
    expect(result).toContain("nested:");
    expect(result).toContain("x: true");
  });

  test("quotes invalid object keys", () => {
    const result = formatLiteral({ "my-key": 1 });
    expect(result).toContain('"my-key": 1');
  });
});

// ---------------------------------------------------------------------------
// asRecord
// ---------------------------------------------------------------------------
describe("asRecord", () => {
  test("returns object as Record", () => {
    const obj = { a: 1 };
    expect(asRecord(obj)).toBe(obj);
  });

  test("returns null for null", () => {
    expect(asRecord(null)).toBeNull();
  });

  test("returns null for undefined", () => {
    expect(asRecord(undefined)).toBeNull();
  });

  test("returns null for arrays", () => {
    expect(asRecord([1, 2])).toBeNull();
  });

  test("returns null for primitives", () => {
    expect(asRecord(42)).toBeNull();
    expect(asRecord("str")).toBeNull();
    expect(asRecord(true)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeGraph
// ---------------------------------------------------------------------------
describe("normalizeGraph", () => {
  test("normalizes a valid graph", () => {
    const result = normalizeGraph({
      nodes: [{ id: "n1", type: "foo.Bar", properties: { x: 1 } }],
      edges: []
    });
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("n1");
    expect(result.nodes[0].type).toBe("foo.Bar");
    expect(result.nodes[0].properties).toEqual({ x: 1 });
  });

  test("throws for missing node arrays", () => {
    expect(() => normalizeGraph({ nodes: null, edges: [] } as any)).toThrow(
      "node and edge arrays"
    );
  });

  test("throws for node missing id", () => {
    expect(() =>
      normalizeGraph({ nodes: [{ type: "foo.Bar" }], edges: [] })
    ).toThrow("missing an id");
  });

  test("throws for node missing type", () => {
    expect(() => normalizeGraph({ nodes: [{ id: "n1" }], edges: [] })).toThrow(
      "missing a type"
    );
  });

  test("throws for control edges", () => {
    expect(() =>
      normalizeGraph({
        nodes: [
          { id: "n1", type: "A" },
          { id: "n2", type: "B" }
        ],
        edges: [
          {
            source: "n1",
            sourceHandle: "out",
            target: "n2",
            targetHandle: "in",
            edge_type: "control"
          }
        ]
      })
    ).toThrow("control edges");
  });

  test("throws for edge missing fields", () => {
    expect(() =>
      normalizeGraph({
        nodes: [
          { id: "n1", type: "A" },
          { id: "n2", type: "B" }
        ],
        edges: [
          { source: "n1", sourceHandle: "", target: "n2", targetHandle: "in" }
        ]
      })
    ).toThrow("missing required fields");
  });

  test("reads properties from data field as fallback", () => {
    const result = normalizeGraph({
      nodes: [{ id: "n1", type: "A", data: { x: 1 } }],
      edges: []
    });
    expect(result.nodes[0].properties).toEqual({ x: 1 });
  });

  test("detects streaming flag", () => {
    const result = normalizeGraph({
      nodes: [{ id: "n1", type: "A", streaming: true }],
      edges: []
    });
    expect(result.nodes[0].streaming).toBe(true);
  });

  test("detects is_streaming_output flag", () => {
    const result = normalizeGraph({
      nodes: [{ id: "n1", type: "A", is_streaming_output: true }],
      edges: []
    });
    expect(result.nodes[0].streaming).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// makeIdentifier
// ---------------------------------------------------------------------------
describe("makeIdentifier", () => {
  test("converts simple name to camelCase identifier", () => {
    const used = new Set<string>();
    expect(makeIdentifier("MyNode", "fallback", used)).toBe("myNode");
  });

  test("uses fallback for empty string", () => {
    const used = new Set<string>();
    expect(makeIdentifier("", "fallback", used)).toBe("fallback");
  });

  test("prefixes with node when starting with digit", () => {
    const used = new Set<string>();
    expect(makeIdentifier("123abc", "fallback", used)).toBe("node123abc");
  });

  test("appends Node suffix for reserved words", () => {
    const used = new Set<string>();
    expect(makeIdentifier("class", "fallback", used)).toBe("classNode");
  });

  test("appends Node suffix for builtin names", () => {
    const used = new Set<string>();
    expect(makeIdentifier("toString", "fallback", used)).toBe("toStringNode");
  });

  test("deduplicates with Node suffix", () => {
    const used = new Set<string>(["myNode"]);
    expect(makeIdentifier("MyNode", "fallback", used)).toBe("myNodeNode");
  });

  test("deduplicates with numeric suffix", () => {
    const used = new Set<string>(["myNode", "myNodeNode"]);
    expect(makeIdentifier("MyNode", "fallback", used)).toBe("myNodeNode2");
  });

  test("splits on non-alphanumeric characters", () => {
    const used = new Set<string>();
    expect(makeIdentifier("my-cool node", "fallback", used)).toBe("myCoolNode");
  });
});

// ---------------------------------------------------------------------------
// workflowConstName
// ---------------------------------------------------------------------------
describe("workflowConstName", () => {
  test("appends Workflow suffix when not present", () => {
    expect(workflowConstName("my transform")).toMatch(/Workflow$/);
  });

  test("does not double-append Workflow", () => {
    const name = workflowConstName("image workflow");
    const matches = name.match(/workflow/gi);
    expect(matches).toHaveLength(1);
  });

  test("uses default for null", () => {
    const name = workflowConstName(null);
    expect(name).toMatch(/Workflow/);
  });

  test("uses default for empty string", () => {
    const name = workflowConstName("");
    expect(name).toMatch(/Workflow/);
  });
});

// ---------------------------------------------------------------------------
// topologicalSort
// ---------------------------------------------------------------------------
describe("topologicalSort", () => {
  const node = (id: string) => ({
    id,
    type: "test",
    properties: {},
    outputs: [],
    dynamicOutputs: [],
    streaming: false
  });

  test("returns single node", () => {
    const nodes = [node("a")];
    expect(topologicalSort(nodes, [])).toEqual(nodes);
  });

  test("sorts a linear chain", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const edges = [
      {
        source: "a",
        sourceHandle: "out",
        target: "b",
        targetHandle: "in",
        edge_type: "data" as const
      },
      {
        source: "b",
        sourceHandle: "out",
        target: "c",
        targetHandle: "in",
        edge_type: "data" as const
      }
    ];
    const sorted = topologicalSort(nodes, edges);
    expect(sorted.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  test("sorts a diamond graph", () => {
    const nodes = [node("a"), node("b"), node("c"), node("d")];
    const edges = [
      {
        source: "a",
        sourceHandle: "out",
        target: "b",
        targetHandle: "in",
        edge_type: "data" as const
      },
      {
        source: "a",
        sourceHandle: "out",
        target: "c",
        targetHandle: "in",
        edge_type: "data" as const
      },
      {
        source: "b",
        sourceHandle: "out",
        target: "d",
        targetHandle: "in",
        edge_type: "data" as const
      },
      {
        source: "c",
        sourceHandle: "out",
        target: "d",
        targetHandle: "in",
        edge_type: "data" as const
      }
    ];
    const sorted = topologicalSort(nodes, edges);
    const ids = sorted.map((n) => n.id);
    expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("b"));
    expect(ids.indexOf("a")).toBeLessThan(ids.indexOf("c"));
    expect(ids.indexOf("b")).toBeLessThan(ids.indexOf("d"));
    expect(ids.indexOf("c")).toBeLessThan(ids.indexOf("d"));
  });

  test("throws on cycle", () => {
    const nodes = [node("a"), node("b")];
    const edges = [
      {
        source: "a",
        sourceHandle: "out",
        target: "b",
        targetHandle: "in",
        edge_type: "data" as const
      },
      {
        source: "b",
        sourceHandle: "out",
        target: "a",
        targetHandle: "in",
        edge_type: "data" as const
      }
    ];
    expect(() => topologicalSort(nodes, edges)).toThrow("cycle");
  });

  test("throws on missing source node", () => {
    const nodes = [node("a")];
    const edges = [
      {
        source: "missing",
        sourceHandle: "out",
        target: "a",
        targetHandle: "in",
        edge_type: "data" as const
      }
    ];
    expect(() => topologicalSort(nodes, edges)).toThrow("missing source node");
  });

  test("throws on missing target node", () => {
    const nodes = [node("a")];
    const edges = [
      {
        source: "a",
        sourceHandle: "out",
        target: "missing",
        targetHandle: "in",
        edge_type: "data" as const
      }
    ];
    expect(() => topologicalSort(nodes, edges)).toThrow("missing target node");
  });
});

// ---------------------------------------------------------------------------
// formatHandleExpression
// ---------------------------------------------------------------------------
describe("formatHandleExpression", () => {
  test("uses .output() for default output", () => {
    const vars = new Map([["n1", "myNode"]]);
    const outputs = new Map([
      ["n1", { outputNames: ["out"], defaultOutput: "out" }]
    ]);
    expect(formatHandleExpression("n1", "out", vars, outputs)).toBe(
      "myNode.output()"
    );
  });

  test("uses .output(name) for non-default", () => {
    const vars = new Map([["n1", "myNode"]]);
    const outputs = new Map([["n1", { outputNames: ["out1", "out2"] }]]);
    expect(formatHandleExpression("n1", "out2", vars, outputs)).toBe(
      'myNode.output("out2")'
    );
  });

  test("throws for missing variable name", () => {
    expect(() =>
      formatHandleExpression("n1", "out", new Map(), new Map())
    ).toThrow("Missing variable name");
  });
});

// ---------------------------------------------------------------------------
// buildCreateNodeOptions
// ---------------------------------------------------------------------------
describe("buildCreateNodeOptions", () => {
  const baseNode = {
    id: "n1",
    type: "test",
    properties: {},
    outputs: [],
    dynamicOutputs: [],
    streaming: false
  };

  test("returns empty string for no outputs and no streaming", () => {
    expect(buildCreateNodeOptions(baseNode, [])).toBe("");
  });

  test("includes outputNames and defaultOutput for single output", () => {
    const result = buildCreateNodeOptions(baseNode, ["result"]);
    expect(result).toContain('outputNames: ["result"]');
    expect(result).toContain('defaultOutput: "result"');
  });

  test("includes outputNames without defaultOutput for multiple outputs", () => {
    const result = buildCreateNodeOptions(baseNode, ["a", "b"]);
    expect(result).toContain('"a"');
    expect(result).toContain('"b"');
    expect(result).not.toContain("defaultOutput");
  });

  test("includes streaming flag", () => {
    const streamingNode = { ...baseNode, streaming: true };
    const result = buildCreateNodeOptions(streamingNode, []);
    expect(result).toContain("streaming: true");
  });
});
