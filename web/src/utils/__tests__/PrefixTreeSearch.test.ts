import { PrefixTreeSearch, SearchField } from "../PrefixTreeSearch";
import { NodeMetadata } from "../stores/ApiTypes";

const createMockNode = (
  node_type: string,
  title: string,
  namespace: string,
  description: string
): NodeMetadata => ({
  node_type,
  title,
  namespace,
  description,
  layout: "default",
  outputs: [],
  properties: [],
  is_dynamic: false,
  supports_dynamic_outputs: false,
  expose_as_tool: false,
  the_model_info: {},
  recommended_models: [],
  basic_fields: [],
  is_streaming_output: false
});

describe("PrefixTreeSearch", () => {
  let search: PrefixTreeSearch;
  let mockNodes: NodeMetadata[];

  beforeEach(() => {
    search = new PrefixTreeSearch();
    mockNodes = [
      createMockNode("text_input", "Text Input", "nodetool.input", "Input text from user"),
      createMockNode("text_output", "Text Output", "nodetool.output", "Display text output"),
      createMockNode("image_input", "Image Input", "nodetool.input", "Input image data"),
      createMockNode("image_output", "Image Output", "nodetool.output", "Display image output"),
      createMockNode("llm_node", "Language Model", "nodetool.llm", "Large language model for text generation"),
      createMockNode("audio_player", "Audio Player", "nodetool.audio", "Play audio files"),
      createMockNode("audio_recorder", "Audio Recorder", "nodetool.audio", "Record audio from microphone"),
      createMockNode("vector_store", "Vector Store", "nodetool.vector", "Store and search vectors"),
    ];
    search.indexNodes(mockNodes);
  });

  describe("constructor", () => {
    test("creates empty search with default fields", () => {
      const emptySearch = new PrefixTreeSearch();
      expect(emptySearch.getStats().nodeCount).toBe(0);
    });

    test("creates search with custom fields", () => {
      const customFields: SearchField[] = [
        { field: "title", weight: 1.0 },
        { field: "description", weight: 0.5 }
      ];
      const customSearch = new PrefixTreeSearch(customFields);
      expect(customSearch.getStats().fields).toContain("title");
      expect(customSearch.getStats().fields).toContain("description");
    });
  });

  describe("indexNodes", () => {
    test("indexes nodes for searching", () => {
      expect(search.getStats().nodeCount).toBe(8);
    });

    test("clears previous index when re-indexing", () => {
      const newNodes = [
        createMockNode("new_node", "New Node", "nodetool.new", "A new node")
      ];
      search.indexNodes(newNodes);
      expect(search.getStats().nodeCount).toBe(1);
    });

    test("handles empty array", () => {
      search.indexNodes([]);
      expect(search.getStats().nodeCount).toBe(0);
    });
  });

  describe("search", () => {
    test("finds nodes by title prefix", () => {
      const results = search.search("text");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.node.title.toLowerCase().includes("text"))).toBe(true);
    });

    test("finds nodes by namespace prefix", () => {
      const results = search.search("nodetool.input");
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.node.namespace.startsWith("nodetool.input"))).toBe(true);
    });

    test("finds nodes by description", () => {
      const results = search.search("audio");
      expect(results.length).toBeGreaterThan(0);
    });

    test("returns empty for no matches", () => {
      const results = search.search("xyznonexistent");
      expect(results).toHaveLength(0);
    });

    test("returns empty for empty query", () => {
      const results = search.search("");
      expect(results).toHaveLength(0);
    });

    test("returns empty for whitespace-only query", () => {
      const results = search.search("   ");
      expect(results).toHaveLength(0);
    });

    test("is case insensitive", () => {
      const upperResults = search.search("TEXT");
      const lowerResults = search.search("text");
      expect(upperResults.length).toBe(lowerResults.length);
    });

    test("respects maxResults option", () => {
      const results = search.search("nodetool", { maxResults: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    test("respects minScore option", () => {
      const results = search.search("nodetool", { minScore: 0.9 });
      results.forEach(r => {
        expect(r.score).toBeGreaterThanOrEqual(0.9);
      });
    });

    test("sorts results by score descending", () => {
      const results = search.search("output");
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  describe("fuzzySearch", () => {
    test("finds nodes containing substring", () => {
      const results = search.fuzzySearch("play");
      expect(results.length).toBeGreaterThan(0);
    });

    test("finds nodes with partial word matches", () => {
      const results = search.fuzzySearch("store");
      expect(results.some(r => r.node.node_type === "vector_store")).toBe(true);
    });

    test("returns empty for no matches", () => {
      const results = search.fuzzySearch("xyznonexistent123");
      expect(results).toHaveLength(0);
    });

    test("respects maxResults option", () => {
      const results = search.fuzzySearch("node", { maxResults: 3 });
      expect(results.length).toBeLessThanOrEqual(3);
    });

    test("gives bonus for prefix matches", () => {
      const prefixResults = search.fuzzySearch("audio", { maxResults: 10 });
      const audioPlayer = prefixResults.find(r => r.node.node_type === "audio_player");
      const vectorStore = prefixResults.find(r => r.node.node_type === "vector_store");
      if (audioPlayer && vectorStore) {
        expect(audioPlayer.score).toBeGreaterThan(vectorStore.score);
      }
    });
  });

  describe("clear", () => {
    test("clears all indexed data", () => {
      search.clear();
      expect(search.getStats().nodeCount).toBe(0);
      const results = search.search("text");
      expect(results).toHaveLength(0);
    });
  });

  describe("getStats", () => {
    test("returns correct node count", () => {
      expect(search.getStats().nodeCount).toBe(8);
    });

    test("returns indexed fields", () => {
      const stats = search.getStats();
      expect(stats.fields).toContain("title");
      expect(stats.fields).toContain("namespace");
      expect(stats.fields).toContain("description");
      expect(stats.fields).toContain("tags");
    });
  });

  describe("search with custom fields", () => {
    test("searches only specified fields", () => {
      const customSearch = new PrefixTreeSearch([
        { field: "title", weight: 1.0 }
      ]);
      customSearch.indexNodes(mockNodes);
      
      const results = customSearch.search("input", { fields: ["title"] });
      results.forEach(r => {
        expect(r.matchedField).toBe("title");
      });
    });
  });

  describe("edge cases", () => {
    test("handles nodes with empty description", () => {
      const nodesWithEmptyDesc = [
        createMockNode("test_node", "Test", "nodetool.test", "")
      ];
      search.indexNodes(nodesWithEmptyDesc);
      const results = search.search("test");
      expect(results.length).toBeGreaterThan(0);
    });

    test("handles special characters in search", () => {
      const results = search.search("@#$%");
      expect(results).toHaveLength(0);
    });

    test("handles very long search terms", () => {
      const longTerm = "a".repeat(100);
      const results = search.search(longTerm);
      expect(results).toHaveLength(0);
    });

    test("handles namespace parts separately", () => {
      const results = search.search("input");
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
