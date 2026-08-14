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

  // -------------------------------------------------------------------------
  // Tier 1 (docs/CODE_NODE_COVERAGE.md) — removed nodetool.text.* nodes
  // rewritten to nodetool.code.Code with the matching snippet's code.
  // -------------------------------------------------------------------------
  describe("Tier 1 text-node -> Code node migrations", () => {
    it("migrates Split to Code with text preserved as a dynamic input", () => {
      const graph = {
        nodes: [
          {
            id: "n1",
            type: "nodetool.text.Split",
            data: { text: "a,b,c", delimiter: "," }
          }
        ],
        edges: []
      };
      const result = migrateGraphNodeTypes(graph);
      const node = result.nodes[0];

      expect(node.type).toBe("nodetool.code.Code");
      expect(node.data.code).toContain("inputs.text.split");
      expect(node.data.packages).toEqual([]);
      // The old node's properties become dynamic inputs — no declared props
      // survive on a node whose config the Code node reads dynamically.
      expect(node.data.text).toBeUndefined();
      expect(node.data.delimiter).toBeUndefined();
      expect(node.dynamic_properties).toEqual({
        text: "a,b,c",
        delimiter: ","
      });
    });

    it("migrates RegexReplace to Code, wiring text/pattern/replacement as dynamic inputs", () => {
      const graph = {
        nodes: [
          {
            id: "n1",
            type: "nodetool.text.RegexReplace",
            properties: {
              text: "abc-123",
              pattern: "\\d+",
              replacement: "X",
              count: 0
            }
          }
        ],
        edges: []
      };
      const result = migrateGraphNodeTypes(graph);
      const node = result.nodes[0];

      expect(node.type).toBe("nodetool.code.Code");
      expect(node.properties.code).toContain("inputs.pattern");
      expect(node.dynamic_properties).toEqual({
        text: "abc-123",
        pattern: "\\d+",
        replacement: "X",
        count: 0
      });
    });

    it("migrates ExtractRegex to Code and renames the regex property to pattern", () => {
      const graph = {
        nodes: [
          {
            id: "n1",
            type: "nodetool.text.ExtractRegex",
            data: { text: "Hello World", regex: "(\\w+)" }
          }
        ],
        edges: [
          {
            source: "src",
            sourceHandle: "output",
            target: "n1",
            targetHandle: "regex"
          }
        ]
      };
      const result = migrateGraphNodeTypes(graph);
      const node = result.nodes[0];

      expect(node.type).toBe("nodetool.code.Code");
      expect(node.data.code).toContain("inputs.pattern");
      // The old `regex` prop is renamed to `pattern` before becoming a
      // dynamic input, matching the snippet's inputs.pattern reference.
      expect(node.dynamic_properties).toEqual({
        text: "Hello World",
        pattern: "(\\w+)"
      });
      expect(result.edges[0].targetHandle).toBe("pattern");
    });

    it("migrates ParseJSON to Code with the json-parse snippet", () => {
      const graph = {
        nodes: [
          {
            id: "n1",
            type: "nodetool.text.ParseJSON",
            data: { text: '{"a":1}' }
          }
        ],
        edges: []
      };
      const result = migrateGraphNodeTypes(graph);
      const node = result.nodes[0];

      expect(node.type).toBe("nodetool.code.Code");
      expect(node.data.code).toBe("return { output: JSON.parse(inputs.text) };");
      expect(node.dynamic_properties).toEqual({ text: '{"a":1}' });
    });

    it("migrates Compare to Code and renames text_a/text_b to a/b", () => {
      const graph = {
        nodes: [
          {
            id: "n1",
            type: "nodetool.text.Compare",
            data: {
              text_a: "Alpha",
              text_b: "alpha",
              case_sensitive: false
            }
          }
        ],
        edges: []
      };
      const result = migrateGraphNodeTypes(graph);
      const node = result.nodes[0];

      expect(node.type).toBe("nodetool.code.Code");
      expect(node.data.code).toContain("inputs.a");
      expect(node.data.code).toContain("inputs.b");
      expect(node.dynamic_properties).toEqual({
        a: "Alpha",
        b: "alpha",
        case_sensitive: false
      });
    });

    it("migrates Replace to Code and renames old/new_value to search/replacement", () => {
      const graph = {
        nodes: [
          {
            id: "n1",
            type: "nodetool.text.Replace",
            data: { text: "hello world", old: "world", new_value: "there" }
          }
        ],
        edges: []
      };
      const result = migrateGraphNodeTypes(graph);
      const node = result.nodes[0];

      expect(node.type).toBe("nodetool.code.Code");
      expect(node.data.code).toBe(
        "return { output: inputs.text.replaceAll(inputs.search, inputs.replacement) };"
      );
      expect(node.dynamic_properties).toEqual({
        text: "hello world",
        search: "world",
        replacement: "there"
      });
    });

    it("covers every Tier 1 nodetool.text.* removal with a Code node migration", () => {
      const expectedFromTypes = [
        "nodetool.text.Split",
        "nodetool.text.Extract",
        "nodetool.text.Chunk",
        "nodetool.text.ExtractRegex",
        "nodetool.text.FindAllRegex",
        "nodetool.text.ParseJSON",
        "nodetool.text.ExtractJSON",
        "nodetool.text.RegexMatch",
        "nodetool.text.RegexReplace",
        "nodetool.text.RegexSplit",
        "nodetool.text.RegexValidate",
        "nodetool.text.Compare",
        "nodetool.text.Equals",
        "nodetool.text.ToUppercase",
        "nodetool.text.ToLowercase",
        "nodetool.text.ToTitlecase",
        "nodetool.text.CapitalizeText",
        "nodetool.text.Slice",
        "nodetool.text.StartsWith",
        "nodetool.text.EndsWith",
        "nodetool.text.Contains",
        "nodetool.text.TrimWhitespace",
        "nodetool.text.CollapseWhitespace",
        "nodetool.text.IsEmpty",
        "nodetool.text.RemovePunctuation",
        "nodetool.text.StripAccents",
        "nodetool.text.Slugify",
        "nodetool.text.HasLength",
        "nodetool.text.TruncateText",
        "nodetool.text.PadText",
        "nodetool.text.Length",
        "nodetool.text.IndexOf",
        "nodetool.text.SurroundWith",
        "nodetool.text.Replace",
        "nodetool.text.ToString"
      ];

      for (const from of expectedFromTypes) {
        const m = NODE_TYPE_MIGRATIONS.find((x) => x.from === from);
        expect(m, `missing migration for ${from}`).toBeDefined();
        expect(m?.to).toBe("nodetool.code.Code");
        expect(typeof m?.setProperties?.code).toBe("string");
        expect(m?.moveRemainingPropertiesToDynamic).toBe(true);
      }
    });
  });

  it("migrates removed lib.pdf.PageCount and SearchText to Code", () => {
    for (const from of ["lib.pdf.PageCount", "lib.pdf.SearchText"]) {
      const m = NODE_TYPE_MIGRATIONS.find((x) => x.from === from);
      expect(m, `missing migration for ${from}`).toBeDefined();
      expect(m?.to).toBe("nodetool.code.Code");
      expect(m?.setProperties?.packages).toEqual(["@nodetool-ai/sandbox-pdf"]);
    }
  });

  it("does not migrate kept lib.pdf conversion nodes", () => {
    for (const from of [
      "lib.pdf.ExtractText",
      "lib.pdf.ExtractMarkdown",
      "lib.pdf.ExtractTables",
      "lib.pdf.ExtractStyledText",
      "lib.pdf.ExtractOcr",
      "lib.pdf.ExtractTextBlocks",
      "lib.pdf.PageMetadata"
    ]) {
      expect(
        NODE_TYPE_MIGRATIONS.find((x) => x.from === from)
      ).toBeUndefined();
    }
  });
});
