import { describe, expect, test } from "vitest";
import { workflowToDsl } from "../src/export.js";

describe("workflowToDsl", () => {
  // Sanity-check that buildFactoryRefs() populated the factory map at import time.
  // If ALL_BASE_NODES or getNodeMetadata fails, this test would error before any
  // graph-level test could run and produce a confusing "is not a function" failure.
  test("module loads and factory map is populated", () => {
    // Any known base-node type must use a factory call, not a createNode fallback.
    const source = workflowToDsl({
      nodes: [
        {
          id: "n1",
          type: "nodetool.constant.Integer",
          properties: { value: 1 }
        }
      ],
      edges: []
    });
    expect(source).not.toContain("createNode");
    expect(source).toContain("constant.integer(");
  });

  test("exports a workflow graph using generated factory namespaces", () => {
    const source = workflowToDsl(
      {
        nodes: [
          {
            id: "const_1",
            type: "nodetool.constant.Integer",
            name: "Input Number",
            properties: { value: 2 }
          },
          {
            id: "sink_1",
            type: "nodetool.output.Output",
            name: "Result",
            properties: {}
          }
        ],
        edges: [
          {
            source: "const_1",
            sourceHandle: "output",
            target: "sink_1",
            targetHandle: "value"
          }
        ]
      },
      { workflowName: "Example Flow" }
    );

    expect(source).toContain(
      'import { constant, output, workflow } from "@nodetool-ai/dsl";'
    );
    expect(source).toContain("const inputNumber = constant.integer({");
    expect(source).toContain("const result = output.output({");
    expect(source).toContain("value: inputNumber.output()");
    expect(source).toContain(
      "export const exampleFlowWorkflow = workflow(result);"
    );
  });

  test("uses named output access for multi-output nodes", () => {
    const source = workflowToDsl({
      nodes: [
        {
          id: "if_1",
          type: "nodetool.control.If",
          name: "Branch",
          properties: {
            condition: true,
            value: "hello"
          }
        },
        {
          id: "collect_1",
          type: "nodetool.control.Collect",
          name: "Collect",
          properties: {}
        }
      ],
      edges: [
        {
          source: "if_1",
          sourceHandle: "if_true",
          target: "collect_1",
          targetHandle: "input_item"
        }
      ]
    });

    expect(source).toContain('input_item: branch.output("if_true")');
  });

  test("falls back to createNode for unknown node types", () => {
    const source = workflowToDsl({
      nodes: [
        {
          id: "custom_1",
          type: "custom.Node",
          name: "Custom Node",
          properties: { prompt: "hi" }
        },
        {
          id: "sink_1",
          type: "nodetool.output.Output",
          name: "Sink",
          properties: {}
        }
      ],
      edges: [
        {
          source: "custom_1",
          sourceHandle: "result",
          target: "sink_1",
          targetHandle: "value"
        }
      ]
    });

    expect(source).toContain(
      'import { createNode, output, workflow } from "@nodetool-ai/dsl";'
    );
    expect(source).toContain(
      'createNode<Record<string, unknown>>("custom.Node"'
    );
    expect(source).toContain("value: customNode.output()");
  });

  test("throws for control edges", () => {
    expect(() =>
      workflowToDsl({
        nodes: [
          {
            id: "a",
            type: "nodetool.constant.Bool",
            properties: { value: true }
          },
          { id: "b", type: "nodetool.control.If", properties: {} }
        ],
        edges: [
          {
            source: "a",
            sourceHandle: "__control__",
            target: "b",
            targetHandle: "__control__",
            edge_type: "control"
          }
        ]
      })
    ).toThrow("TypeScript DSL does not support");
  });

  test("diamond graph — shared source declared once, both consumers reference it", () => {
    const source = workflowToDsl({
      nodes: [
        {
          id: "src",
          type: "nodetool.constant.Integer",
          name: "Source",
          properties: { value: 10 }
        },
        {
          id: "out1",
          type: "nodetool.output.Output",
          name: "Out One",
          properties: {}
        },
        {
          id: "out2",
          type: "nodetool.output.Output",
          name: "Out Two",
          properties: {}
        }
      ],
      edges: [
        {
          source: "src",
          sourceHandle: "output",
          target: "out1",
          targetHandle: "value"
        },
        {
          source: "src",
          sourceHandle: "output",
          target: "out2",
          targetHandle: "value"
        }
      ]
    });
    // Source constant is declared exactly once
    expect((source.match(/\bconst source\b/g) ?? []).length).toBe(1);
    // Both consumers reference source via output()
    expect((source.match(/source\.output\(\)/g) ?? []).length).toBe(2);
    // Both terminals appear in the workflow() call
    expect(source).toContain("workflow(outOne, outTwo)");
  });

  test("identifier collision — duplicate node names get unique suffixes", () => {
    const source = workflowToDsl({
      nodes: [
        {
          id: "src",
          type: "nodetool.constant.Integer",
          name: "Count",
          properties: { value: 1 }
        },
        {
          id: "b",
          type: "nodetool.output.Output",
          name: "Result",
          properties: {}
        },
        {
          id: "c",
          type: "nodetool.output.Output",
          name: "Result",
          properties: {}
        }
      ],
      edges: [
        {
          source: "src",
          sourceHandle: "output",
          target: "b",
          targetHandle: "value"
        },
        {
          source: "src",
          sourceHandle: "output",
          target: "c",
          targetHandle: "value"
        }
      ]
    });
    expect(source).toContain("const result = output.output(");
    expect(source).toContain("const resultNode = output.output(");
  });

  test("reserved JS keyword as node name gets Node suffix", () => {
    const source = workflowToDsl({
      nodes: [
        {
          id: "cond",
          type: "nodetool.constant.Bool",
          name: "if",
          properties: { value: true }
        },
        {
          id: "sink",
          type: "nodetool.output.Output",
          name: "Result",
          properties: {}
        }
      ],
      edges: [
        {
          source: "cond",
          sourceHandle: "output",
          target: "sink",
          targetHandle: "value"
        }
      ]
    });
    expect(source).toContain("const ifNode = ");
    expect(source).not.toContain("const if =");
  });

  test("workflowName: null produces exportedWorkflow constant", () => {
    const source = workflowToDsl(
      {
        nodes: [
          {
            id: "n",
            type: "nodetool.constant.Integer",
            properties: { value: 1 }
          }
        ],
        edges: []
      },
      { workflowName: null }
    );
    expect(source).toContain("export const exportedWorkflow = workflow(");
  });

  test("workflowName: 'my workflow' → myWorkflow (no double Workflow suffix)", () => {
    const source = workflowToDsl(
      {
        nodes: [
          {
            id: "n",
            type: "nodetool.constant.Integer",
            properties: { value: 1 }
          }
        ],
        edges: []
      },
      { workflowName: "my workflow" }
    );
    expect(source).toContain("export const myWorkflow = workflow(");
    expect(source).not.toContain("myWorkflowWorkflow");
  });

  test("workflowName already ending with Workflow gets no extra suffix", () => {
    const source = workflowToDsl(
      {
        nodes: [
          {
            id: "n",
            type: "nodetool.constant.Integer",
            properties: { value: 1 }
          }
        ],
        edges: []
      },
      { workflowName: "data pipeline workflow" }
    );
    expect(source).toContain("export const dataPipelineWorkflow = workflow(");
    expect(source).not.toContain("WorkflowWorkflow");
  });

  test("complex property types — arrays and nested objects formatted correctly", () => {
    const source = workflowToDsl({
      nodes: [
        {
          id: "n1",
          type: "nodetool.constant.Integer",
          name: "Config",
          properties: {
            tags: ["alpha", "beta", "gamma"],
            options: { threshold: 0.75, enabled: true }
          }
        }
      ],
      edges: []
    });
    expect(source).toContain('"alpha"');
    expect(source).toContain('"beta"');
    expect(source).toContain("threshold: 0.75");
    expect(source).toContain("enabled: true");
  });

  test("cyclic graph throws a cycle error", () => {
    expect(() =>
      workflowToDsl({
        nodes: [
          { id: "a", type: "nodetool.constant.Integer", properties: {} },
          { id: "b", type: "nodetool.output.Output", properties: {} }
        ],
        edges: [
          {
            source: "a",
            sourceHandle: "output",
            target: "b",
            targetHandle: "value"
          },
          {
            source: "b",
            sourceHandle: "value",
            target: "a",
            targetHandle: "value"
          }
        ]
      })
    ).toThrow("cycle");
  });

  test("node missing id throws a descriptive error", () => {
    expect(() =>
      workflowToDsl({
        nodes: [{ type: "nodetool.constant.Integer", properties: {} }],
        edges: []
      })
    ).toThrow("missing an id");
  });

  test("node missing type throws a descriptive error", () => {
    expect(() =>
      workflowToDsl({
        nodes: [{ id: "n1", properties: {} }],
        edges: []
      })
    ).toThrow("missing a type");
  });

  test("topological order — source variables appear before consumer variables", () => {
    const source = workflowToDsl({
      nodes: [
        {
          id: "src",
          type: "nodetool.constant.Integer",
          name: "Source",
          properties: { value: 1 }
        },
        {
          id: "mid",
          type: "nodetool.output.Output",
          name: "Sink",
          properties: {}
        }
      ],
      edges: [
        {
          source: "src",
          sourceHandle: "output",
          target: "mid",
          targetHandle: "value"
        }
      ]
    });
    const srcPos = source.indexOf("const source");
    const sinkPos = source.indexOf("const sink");
    expect(srcPos).toBeGreaterThan(-1);
    expect(sinkPos).toBeGreaterThan(-1);
    expect(srcPos).toBeLessThan(sinkPos);
  });

  test("import statement collects all namespaces used across nodes", () => {
    const source = workflowToDsl({
      nodes: [
        {
          id: "c",
          type: "nodetool.constant.Integer",
          name: "Num",
          properties: { value: 1 }
        },
        {
          id: "s",
          type: "nodetool.output.Output",
          name: "Result",
          properties: {}
        }
      ],
      edges: [
        {
          source: "c",
          sourceHandle: "output",
          target: "s",
          targetHandle: "value"
        }
      ]
    });
    expect(source).toContain(
      'import { constant, output, workflow } from "@nodetool-ai/dsl";'
    );
  });

  test("multiple source nodes with no shared edges are all included", () => {
    const source = workflowToDsl({
      nodes: [
        {
          id: "a",
          type: "nodetool.constant.Integer",
          name: "Alpha",
          properties: { value: 1 }
        },
        {
          id: "b",
          type: "nodetool.constant.Integer",
          name: "Beta",
          properties: { value: 2 }
        }
      ],
      edges: []
    });
    expect(source).toContain("const alpha = constant.integer(");
    expect(source).toContain("const beta = constant.integer(");
    // Both are terminals with no edges
    expect(source).toContain("workflow(alpha, beta)");
  });
});
