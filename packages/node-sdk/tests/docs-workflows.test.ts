import { describe, expect, it } from "vitest";
import {
  generateAllWorkflowDocs,
  generateWorkflowMarkdown,
  type WorkflowFile
} from "../src/docs/workflows.js";

const workflow: WorkflowFile = {
  path: "examples/hello.json",
  data: {
    name: "Hello Workflow",
    description: "Greets the user.",
    graph: {
      nodes: [
        {
          id: "in1",
          type: "nodetool.input.StringInput",
          properties: { name: "message", description: "Your message" }
        },
        {
          id: "out1",
          type: "nodetool.output.StringOutput",
          properties: { name: "greeting", description: "The greeting" }
        },
        {
          id: "n1",
          type: "nodetool.text.Format",
          properties: {}
        }
      ],
      edges: [
        { source: "in1", target: "n1", sourceHandle: "output", targetHandle: "input" },
        { source: "n1", target: "out1", sourceHandle: "output", targetHandle: "value" }
      ]
    }
  }
};

describe("generateWorkflowMarkdown", () => {
  it("lists inputs, outputs, and counts", () => {
    const md = generateWorkflowMarkdown(workflow);
    expect(md).toContain("# Hello Workflow");
    expect(md).toContain("Greets the user.");
    expect(md).toContain("**Source:** `examples/hello.json`");
    expect(md).toContain("**Nodes:** 3");
    expect(md).toContain("**Edges:** 2");
    expect(md).toContain("## Inputs");
    expect(md).toContain("| message | StringInput | Your message |");
    expect(md).toContain("## Outputs");
    expect(md).toContain("| greeting | StringOutput | The greeting |");
  });
});

describe("generateAllWorkflowDocs", () => {
  it("emits one file per workflow keyed by slugified name", () => {
    const docs = generateAllWorkflowDocs([workflow]);
    expect(docs.size).toBe(1);
    expect([...docs.keys()][0]).toBe("hello-workflow.md");
  });

  it("filters by package_name when provided", () => {
    const tagged: WorkflowFile = {
      path: "examples/x.json",
      data: { name: "X", package_name: "nodetool-sample", graph: { nodes: [], edges: [] } }
    };
    const untagged: WorkflowFile = {
      path: "examples/y.json",
      data: { name: "Y", package_name: "other", graph: { nodes: [], edges: [] } }
    };
    const docs = generateAllWorkflowDocs([tagged, untagged], {
      packageName: "nodetool-sample"
    });
    expect(docs.size).toBe(1);
    expect([...docs.keys()][0]).toBe("x.md");
  });
});
