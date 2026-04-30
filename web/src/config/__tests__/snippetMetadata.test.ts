import {
  SNIPPET_NODE_PREFIX,
  snippetNodeType,
  findSnippetByNodeType,
  generateSnippetMetadata
} from "../snippetMetadata";
import { CODE_SNIPPETS } from "../codeSnippets";

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

    it("sets is_dynamic to true", () => {
      const metadata = generateSnippetMetadata();
      const nodeType = Object.keys(metadata)[0];
      expect(metadata[nodeType].is_dynamic).toBe(true);
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
});
