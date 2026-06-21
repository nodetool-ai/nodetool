import { describe, it, expect } from "vitest";
import {
  migrateGraphNodeTypes,
  NODE_TYPE_MIGRATIONS
} from "../src/graph.js";

describe("migrateGraphNodeTypes", () => {
  it("rewrites FormatText to Prompt and renames the template property", () => {
    const graph = {
      nodes: [
        {
          id: "n1",
          type: "nodetool.text.FormatText",
          data: { template: "Hi {{ name }}" },
          dynamic_properties: { name: "world" }
        }
      ],
      edges: []
    };

    const result = migrateGraphNodeTypes(graph);
    const node = result.nodes[0];

    expect(node.type).toBe("nodetool.text.Prompt");
    expect(node.data).toEqual({ prompt: "Hi {{ name }}" });
    expect("template" in node.data).toBe(false);
    // dynamic_properties (the template variables) are untouched
    expect(node.dynamic_properties).toEqual({ name: "world" });
  });

  it("renames an incoming edge's targetHandle from template to prompt", () => {
    const graph = {
      nodes: [
        { id: "src", type: "nodetool.constant.String", data: {} },
        { id: "fmt", type: "nodetool.text.FormatText", data: {} }
      ],
      edges: [
        {
          source: "src",
          sourceHandle: "output",
          target: "fmt",
          targetHandle: "template"
        }
      ]
    };

    const result = migrateGraphNodeTypes(graph);
    expect(result.edges[0].targetHandle).toBe("prompt");
    // a dynamic-variable edge handle is left alone
  });

  it("leaves non-template edge handles into a migrated node alone", () => {
    const graph = {
      nodes: [{ id: "fmt", type: "nodetool.text.FormatText", data: {} }],
      edges: [
        {
          source: "x",
          sourceHandle: "output",
          target: "fmt",
          targetHandle: "name"
        }
      ]
    };
    const result = migrateGraphNodeTypes(graph);
    expect(result.edges[0].targetHandle).toBe("name");
  });

  it("migrates the template field inside `properties` too", () => {
    const graph = {
      nodes: [
        {
          id: "n1",
          type: "nodetool.text.FormatText",
          properties: { template: "x" }
        }
      ],
      edges: []
    };
    const result = migrateGraphNodeTypes(graph);
    expect(result.nodes[0].properties).toEqual({ prompt: "x" });
  });

  it("returns the same reference when nothing matches (no allocation)", () => {
    const graph = {
      nodes: [{ id: "n1", type: "nodetool.text.Prompt", data: { prompt: "x" } }],
      edges: []
    };
    expect(migrateGraphNodeTypes(graph)).toBe(graph);
  });

  it("does not clobber an existing prompt field", () => {
    const graph = {
      nodes: [
        {
          id: "n1",
          type: "nodetool.text.FormatText",
          data: { template: "from-template", prompt: "existing" }
        }
      ],
      edges: []
    };
    const result = migrateGraphNodeTypes(graph);
    // existing `prompt` wins; `template` is kept rather than silently dropping data
    expect(result.nodes[0].data.prompt).toBe("existing");
  });

  it("tolerates missing/!object graphs", () => {
    expect(migrateGraphNodeTypes(null as never)).toBe(null);
    expect(migrateGraphNodeTypes({} as never)).toEqual({});
    expect(migrateGraphNodeTypes({ nodes: "nope" } as never)).toEqual({
      nodes: "nope"
    });
  });

  it("exposes FormatText -> Prompt in the migration table", () => {
    const m = NODE_TYPE_MIGRATIONS.find(
      (x) => x.from === "nodetool.text.FormatText"
    );
    expect(m?.to).toBe("nodetool.text.Prompt");
    expect(m?.renameProperties).toEqual({ template: "prompt" });
  });
});
