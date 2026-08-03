import {
  SNIPPET_NODE_PREFIX,
  snippetNodeType,
  findSnippetByNodeType,
  generateSnippetMetadata
} from "../snippetMetadata";
import { CODE_SNIPPETS } from "../codeSnippets";
import {
  inferInputKeysFromCode,
  inferOutputKeysFromCode
} from "../../utils/codeOutputInference";

describe("snippetMetadata", () => {
  describe("snippetNodeType", () => {
    it("generates a node type with the correct prefix", () => {
      const snippet = CODE_SNIPPETS[0];
      const nodeType = snippetNodeType(snippet);
      expect(nodeType.startsWith(SNIPPET_NODE_PREFIX)).toBe(true);
    });

    it("converts category to slug in node type", () => {
      const snippet = {
        ...CODE_SNIPPETS[0],
        category: "Boolean & Logic" as const,
        id: "test-snippet"
      };
      const nodeType = snippetNodeType(snippet);
      expect(nodeType).toContain("boolean_logic");
      expect(nodeType).not.toContain("&");
      expect(nodeType).not.toContain(" ");
    });

    it("replaces hyphens with underscores in snippet id", () => {
      const snippet = {
        ...CODE_SNIPPETS[0],
        category: "Math" as const,
        id: "my-test-snippet"
      };
      const nodeType = snippetNodeType(snippet);
      expect(nodeType).toContain("my_test_snippet");
    });
  });

  describe("findSnippetByNodeType", () => {
    it("finds a snippet by its generated node type", () => {
      const snippet = CODE_SNIPPETS[0];
      const nodeType = snippetNodeType(snippet);
      const found = findSnippetByNodeType(nodeType);
      expect(found).toBeDefined();
      expect(found?.id).toBe(snippet.id);
    });

    it("returns undefined for unknown node types", () => {
      expect(findSnippetByNodeType("nodetool.nonexistent.node")).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      expect(findSnippetByNodeType("")).toBeUndefined();
    });
  });

  describe("generateSnippetMetadata", () => {
    it("generates metadata for all snippets", () => {
      const metadata = generateSnippetMetadata();
      expect(Object.keys(metadata).length).toBe(CODE_SNIPPETS.length);
    });

    it("generates metadata with correct node_type keys", () => {
      const metadata = generateSnippetMetadata();
      for (const snippet of CODE_SNIPPETS) {
        const expectedType = snippetNodeType(snippet);
        expect(metadata[expectedType]).toBeDefined();
      }
    });

    it("populates title and description from snippet", () => {
      const metadata = generateSnippetMetadata();
      const snippet = CODE_SNIPPETS[0];
      const nodeType = snippetNodeType(snippet);
      const entry = metadata[nodeType];
      expect(entry.title).toBe(snippet.title);
      expect(entry.description).toContain(snippet.description);
    });

    it("includes tags in description", () => {
      const metadata = generateSnippetMetadata();
      const snippet = CODE_SNIPPETS[0];
      const nodeType = snippetNodeType(snippet);
      const entry = metadata[nodeType];
      for (const tag of snippet.tags) {
        expect(entry.description).toContain(tag);
      }
    });

    it("sets supports_dynamic_inputs to true", () => {
      const metadata = generateSnippetMetadata();
      const nodeType = Object.keys(metadata)[0];
      expect(metadata[nodeType].supports_dynamic_inputs).toBe(true);
    });

    it("includes namespace matching the category slug", () => {
      const metadata = generateSnippetMetadata();
      for (const entry of Object.values(metadata)) {
        expect(entry.namespace.startsWith(SNIPPET_NODE_PREFIX)).toBe(true);
      }
    });

    it("has at least one output per snippet", () => {
      const metadata = generateSnippetMetadata();
      for (const entry of Object.values(metadata)) {
        expect(entry.outputs.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("declared slot types", () => {
    const metadataFor = (id: string) => {
      const snippet = CODE_SNIPPETS.find((s) => s.id === id);
      if (!snippet) throw new Error(`no snippet ${id}`);
      return generateSnippetMetadata()[snippetNodeType(snippet)];
    };

    it("types a declared output from the snippet, not the category", () => {
      const entry = metadataFor("svg-circle");
      expect(entry.outputs).toEqual([
        {
          name: "output",
          type: { type: "svg_element", type_args: [], optional: false },
          stream: false
        }
      ]);
    });

    it("types each declared input independently", () => {
      const byName = new Map(
        metadataFor("svg-circle").properties.map((p) => [p.name, p])
      );
      expect(byName.get("cx")?.type.type).toBe("int");
      expect(byName.get("radius")?.type.type).toBe("int");
      expect(byName.get("fill")?.type.type).toBe("color");
      expect(byName.get("stroke_width")?.type.type).toBe("float");
    });

    it("carries declared default, min, max and description", () => {
      const byName = new Map(
        metadataFor("svg-gradient").properties.map((p) => [p.name, p])
      );
      expect(byName.get("x2")).toMatchObject({
        default: 100,
        min: 0,
        max: 100,
        required: false
      });
      const points = metadataFor("svg-polygon").properties.find(
        (p) => p.name === "points"
      );
      expect(points?.description).toContain("Vertices");
    });

    it("omits min/max/description when the snippet declares none", () => {
      const cx = metadataFor("svg-circle").properties.find(
        (p) => p.name === "cx"
      );
      expect(cx && "min" in cx).toBe(false);
      expect(cx && "max" in cx).toBe(false);
      expect(cx && "description" in cx).toBe(false);
    });

    it("declares only slots the inferred code produces", () => {
      const entry = metadataFor("svg-transform");
      const names = entry.properties.map((p) => p.name).sort();
      expect(names).toEqual(
        [...(inferInputKeysFromCode(
          CODE_SNIPPETS.find((s) => s.id === "svg-transform")!.code
        ) ?? [])].sort()
      );
    });
  });

  describe("undeclared snippets keep the category fallback", () => {
    /**
     * Frozen copy of the pre-declaration generator. 160 shipped snippets
     * declare nothing and must be byte-identical to what this produces.
     */
    const legacyEntry = (snippet: (typeof CODE_SNIPPETS)[number]) => {
      const CATEGORY_TYPE: Record<string, string> = {
        "Boolean & Logic": "bool",
        Math: "float",
        Text: "str",
        Regex: "str",
        List: "list",
        Dictionary: "dict",
        "Date & Time": "str",
        UUID: "str",
        JSON: "str",
        Streaming: "str",
        Path: "str",
        SVG: "svg_element",
        HTTP: "str",
        Markdown: "list",
        HTML: "list",
        Validation: "bool"
      };
      const defaultType = CATEGORY_TYPE[snippet.category] || "str";
      const inputKeys = inferInputKeysFromCode(snippet.code) || [];
      const outputKeys = inferOutputKeysFromCode(snippet.code) || ["output"];
      return {
        properties: inputKeys.map((name) => ({
          name,
          type: { type: defaultType, type_args: [], optional: false },
          default:
            defaultType === "bool"
              ? false
              : defaultType === "float"
                ? 0
                : defaultType === "list"
                  ? []
                  : defaultType === "dict"
                    ? {}
                    : "",
          required: false
        })),
        outputs: outputKeys.map((name) => ({
          name,
          type: { type: defaultType, type_args: [], optional: false },
          stream: false
        }))
      };
    };

    it("matches the legacy generator for every undeclared snippet", () => {
      const metadata = generateSnippetMetadata();
      const undeclared = CODE_SNIPPETS.filter((s) => !s.inputs && !s.outputs);
      expect(undeclared.length).toBeGreaterThan(100);
      for (const snippet of undeclared) {
        const entry = metadata[snippetNodeType(snippet)];
        const legacy = legacyEntry(snippet);
        expect(entry.properties).toEqual(legacy.properties);
        expect(entry.outputs).toEqual(legacy.outputs);
      }
    });

    it("covers every snippet as either declared or legacy-identical", () => {
      const declared = CODE_SNIPPETS.filter((s) => s.inputs || s.outputs);
      const undeclared = CODE_SNIPPETS.filter((s) => !s.inputs && !s.outputs);
      expect(declared.length + undeclared.length).toBe(CODE_SNIPPETS.length);
    });
  });
});
