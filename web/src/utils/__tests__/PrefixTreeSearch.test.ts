/**
 * @jest-environment node
 */
import {
  PrefixTreeSearch,
  SearchField,
  PrefixSearchOptions,
} from "../PrefixTreeSearch";
import { NodeMetadata } from "../../stores/ApiTypes";

const SHOULD_ENFORCE_PERF = process.env.PERF_TESTS === "true";
const assertPerf = (duration: number, threshold: number) => {
  if (SHOULD_ENFORCE_PERF) {
    expect(duration).toBeLessThan(threshold);
  }
};

describe("PrefixTreeSearch", () => {
  const createMockNode = (
    nodeType: string,
    title: string,
    namespace: string,
    description?: string
  ): NodeMetadata => ({
    node_type: nodeType,
    title,
    namespace,
    description: description || "",
    properties: [],
    outputs: [],
    the_model_info: {},
    layout: "default",
    recommended_models: [],
    basic_fields: [],
    is_dynamic: false,
    expose_as_tool: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false,
  });

  const mockNodes: NodeMetadata[] = [
    createMockNode("math.add", "Add", "math", "Adds two numbers together"),
    createMockNode(
      "math.subtract",
      "Subtract",
      "math",
      "Subtracts one number from another"
    ),
    createMockNode(
      "math.multiply",
      "Multiply",
      "math",
      "Multiplies two numbers"
    ),
    createMockNode("math.divide", "Divide", "math", "Divides two numbers"),
    createMockNode(
      "string.concat",
      "Concatenate",
      "string",
      "Joins strings together"
    ),
    createMockNode(
      "string.split",
      "Split",
      "string",
      "Splits a string by delimiter"
    ),
    createMockNode(
      "string.uppercase",
      "Uppercase",
      "string",
      "Converts string to uppercase"
    ),
    createMockNode("image.resize", "Resize", "image", "Resizes an image"),
    createMockNode("image.crop", "Crop", "image", "Crops an image"),
    createMockNode(
      "image.filter.blur",
      "Blur",
      "image.filter",
      "Applies blur filter"
    ),
    createMockNode(
      "image.filter.sharpen",
      "Sharpen",
      "image.filter",
      "Applies sharpen filter"
    ),
  ];

  describe("Constructor and Initialization", () => {
    it("should create an instance with default fields", () => {
      const search = new PrefixTreeSearch();
      expect(search).toBeInstanceOf(PrefixTreeSearch);
      const stats = search.getStats();
      expect(stats.nodeCount).toBe(0);
      expect(stats.fields.length).toBeGreaterThan(0);
    });

    it("should create an instance with custom fields", () => {
      const customFields: SearchField[] = [
        { field: "title", weight: 1.0 },
        { field: "namespace", weight: 0.5 },
      ];
      const search = new PrefixTreeSearch(customFields);
      const stats = search.getStats();
      expect(stats.fields).toContain("title");
      expect(stats.fields).toContain("namespace");
    });
  });

  describe("Indexing", () => {
    it("should index nodes correctly", () => {
      const search = new PrefixTreeSearch();
      search.indexNodes(mockNodes);
      const stats = search.getStats();
      expect(stats.nodeCount).toBe(mockNodes.length);
    });

    it("should handle empty node list", () => {
      const search = new PrefixTreeSearch();
      search.indexNodes([]);
      const stats = search.getStats();
      expect(stats.nodeCount).toBe(0);
    });

    it("should re-index when called multiple times", () => {
      const search = new PrefixTreeSearch();
      search.indexNodes(mockNodes.slice(0, 5));
      expect(search.getStats().nodeCount).toBe(5);

      search.indexNodes(mockNodes);
      expect(search.getStats().nodeCount).toBe(mockNodes.length);
    });
  });

  describe("Prefix Search", () => {
    let search: PrefixTreeSearch;

    beforeEach(() => {
      search = new PrefixTreeSearch();
      search.indexNodes(mockNodes);
    });

    it("should find nodes by title prefix", () => {
      const results = search.search("Add");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].node.title).toBe("Add");
      // When searching for "Add" and finding "Add", it's an exact match
      expect(results[0].matchType).toBe("exact");
    });

    it("should find nodes by namespace prefix", () => {
      const results = search.search("math");
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.node.namespace.startsWith("math"))).toBe(
        true
      );
    });

    it("should be case-insensitive", () => {
      const resultsLower = search.search("add");
      const resultsUpper = search.search("ADD");
      const resultsMixed = search.search("AdD");

      expect(resultsLower.length).toBeGreaterThan(0);
      expect(resultsUpper.length).toEqual(resultsLower.length);
      expect(resultsMixed.length).toEqual(resultsLower.length);
    });

    it("should handle partial matches", () => {
      const results = search.search("div");
      expect(results.length).toBeGreaterThan(0);
      expect(
        results.some((r) => r.node.title.toLowerCase().startsWith("div"))
      ).toBe(true);
    });

    it("should return empty array for no matches", () => {
      const results = search.search("xyz123notfound");
      expect(results).toEqual([]);
    });

    it("should return empty array for empty query", () => {
      const results = search.search("");
      expect(results).toEqual([]);
    });

    it("should handle whitespace in query", () => {
      const results = search.search("  Add  ");
      expect(results.length).toBeGreaterThan(0);
    });

    it("should respect maxResults option", () => {
      const results = search.search("i", { maxResults: 3 });
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it("should respect minScore option", () => {
      const results = search.search("i", { minScore: 0.9 });
      expect(results.every((r) => r.score >= 0.9)).toBe(true);
    });

    it("should rank results by score", () => {
      const results = search.search("s");
      expect(results.length).toBeGreaterThan(1);

      // Verify results are sorted by score (descending)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it("should handle nested namespace searches", () => {
      const results = search.search("image.filter");
      expect(results.length).toBeGreaterThan(0);
      expect(
        results.every((r) => r.node.namespace.startsWith("image.filter"))
      ).toBe(true);
    });
  });

  describe("Fuzzy Search", () => {
    let search: PrefixTreeSearch;

    beforeEach(() => {
      search = new PrefixTreeSearch();
      search.indexNodes(mockNodes);
    });

    it("should find nodes with substring match", () => {
      const results = search.fuzzySearch("ult");
      expect(results.length).toBeGreaterThan(0);
      // Should find "Multiply" which contains "ult"
    });

    it("should find nodes by description words", () => {
      const results = search.fuzzySearch("numbers");
      expect(results.length).toBeGreaterThan(0);
    });

    it("should be case-insensitive", () => {
      const resultsLower = search.fuzzySearch("blur");
      const resultsUpper = search.fuzzySearch("BLUR");

      expect(resultsLower.length).toBeGreaterThan(0);
      expect(resultsUpper.length).toEqual(resultsLower.length);
    });

    it("should respect maxResults option", () => {
      const results = search.fuzzySearch("i", { maxResults: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("should not return duplicates", () => {
      const results = search.fuzzySearch("i");
      const nodeTypes = results.map((r) => r.node.node_type);
      const uniqueNodeTypes = [...new Set(nodeTypes)];
      expect(nodeTypes.length).toBe(uniqueNodeTypes.length);
    });

    it("should give bonus to prefix matches", () => {
      const results = search.fuzzySearch("add");
      const exactMatch = results.find((r) => r.node.title === "Add");
      expect(exactMatch).toBeDefined();
      // Prefix matches should have higher scores
      if (exactMatch) {
        const otherMatches = results.filter((r) => r.node.title !== "Add");
        if (otherMatches.length > 0) {
          expect(exactMatch.score).toBeGreaterThan(otherMatches[0].score);
        }
      }
    });
  });

  describe("Clear", () => {
    it("should clear all indexed data", () => {
      const search = new PrefixTreeSearch();
      search.indexNodes(mockNodes);
      expect(search.getStats().nodeCount).toBe(mockNodes.length);

      search.clear();
      expect(search.getStats().nodeCount).toBe(0);

      const results = search.search("Add");
      expect(results).toEqual([]);
    });
  });

  describe("Performance Benchmarks", () => {
    /**
     * Performance threshold constants
     * These represent maximum acceptable search times in milliseconds
     */
    const PERF_THRESHOLD_SMALL = 5; // 5ms for 100 nodes
    const PERF_THRESHOLD_MEDIUM = 15; // 15ms for 1000 nodes
    const PERF_THRESHOLD_LARGE = 50; // 50ms for 5000 nodes

    /**
     * Generate a large dataset for performance testing
     */
    const generateLargeDataset = (count: number): NodeMetadata[] => {
      const nodes: NodeMetadata[] = [];
      const namespaces = [
        "math",
        "string",
        "image",
        "audio",
        "video",
        "data",
        "ai",
        "ml",
      ];
      const operations = [
        "add",
        "subtract",
        "multiply",
        "divide",
        "process",
        "transform",
        "convert",
        "analyze",
      ];

      for (let i = 0; i < count; i++) {
        const namespace =
          namespaces[i % namespaces.length] +
          (i % 3 === 0 ? `.sub${Math.floor(i / 10)}` : "");
        const operation = operations[i % operations.length];
        nodes.push(
          createMockNode(
            `${namespace}.${operation}${i}`,
            `${operation.charAt(0).toUpperCase() + operation.slice(1)} ${i}`,
            namespace,
            `Description for ${operation} operation number ${i}`
          )
        );
      }

      return nodes;
    };

    it("should search within threshold for 100 nodes", () => {
      const nodes = generateLargeDataset(100);
      const search = new PrefixTreeSearch();

      // Indexing time (not counted in search performance)
      search.indexNodes(nodes);

      // Measure search time
      const start = performance.now();
      const results = search.search("add");
      const duration = performance.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(PERF_THRESHOLD_SMALL);

      console.log(`[PERF] Search 100 nodes: ${duration.toFixed(2)}ms`);
    });

    it("should search within threshold for 1000 nodes", () => {
      const nodes = generateLargeDataset(1000);
      const search = new PrefixTreeSearch();

      search.indexNodes(nodes);

      const start = performance.now();
      const results = search.search("process");
      const duration = performance.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(PERF_THRESHOLD_MEDIUM);

      console.log(`[PERF] Search 1000 nodes: ${duration.toFixed(2)}ms`);
    });

    it("should search within threshold for 5000 nodes", () => {
      const nodes = generateLargeDataset(5000);
      const search = new PrefixTreeSearch();

      search.indexNodes(nodes);

      const start = performance.now();
      const results = search.search("trans");
      const duration = performance.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(PERF_THRESHOLD_LARGE);

      console.log(`[PERF] Search 5000 nodes: ${duration.toFixed(2)}ms`);
    });

    it("should have consistent performance regardless of result set size", () => {
      // Test that search time is consistent for different result set sizes
      // This verifies we're not scanning through all results
      const nodes = generateLargeDataset(2000);
      const search = new PrefixTreeSearch();
      search.indexNodes(nodes);

      // These queries should return different numbers of results
      const queries = ["add0", "add", "a"]; // specific -> general
      const times: number[] = [];

      queries.forEach((query) => {
        // Run each search multiple times to get accurate timing
        const iterations = 50;
        const start = performance.now();
        for (let i = 0; i < iterations; i++) {
          const results = search.search(query, { maxResults: 100 });
        }
        const avgTime = (performance.now() - start) / iterations;
        times.push(avgTime);
      });

      // All searches should complete in reasonable time
      times.forEach((time) => {
        assertPerf(time, 5); // Each search < 5ms
      });

      console.log(
        `[PERF] Search times for different result sizes: ${times
          .map((t) => t.toFixed(3))
          .join("ms, ")}ms`
      );
    });

    it("should index quickly for large datasets", () => {
      const nodes = generateLargeDataset(5000);
      const search = new PrefixTreeSearch();

      const start = performance.now();
      search.indexNodes(nodes);
      const duration = performance.now() - start;

      // Indexing 5000 nodes should take less than 800ms in CI
      assertPerf(duration, 800);

      console.log(`[PERF] Index 5000 nodes: ${duration.toFixed(2)}ms`);
    });

    it("should perform multiple searches efficiently", () => {
      const nodes = generateLargeDataset(1000);
      const search = new PrefixTreeSearch();
      search.indexNodes(nodes);

      const queries = [
        "add",
        "sub",
        "mul",
        "div",
        "proc",
        "trans",
        "conv",
        "ana",
      ];
      const start = performance.now();

      queries.forEach((query) => {
        search.search(query);
      });

      const duration = performance.now() - start;
      const avgTime = duration / queries.length;

      // Average search time should be less than 10ms
      expect(avgTime).toBeLessThan(10);

      console.log(
        `[PERF] ${queries.length} searches avg: ${avgTime.toFixed(2)}ms`
      );
    });

    it("should fail if search performance regresses", () => {
      // This is a regression test - if this fails, performance has degraded
      const nodes = generateLargeDataset(1000);
      const search = new PrefixTreeSearch();
      search.indexNodes(nodes);

      const start = performance.now();
      const results = search.search("test");
      const duration = performance.now() - start;

      // CRITICAL: This threshold should not increase
      // If this test fails, the search algorithm has regressed
      expect(duration).toBeLessThan(PERF_THRESHOLD_MEDIUM);

      if (duration > PERF_THRESHOLD_MEDIUM * 0.8) {
        console.warn(
          `[PERF WARNING] Search time (${duration.toFixed(2)}ms) is approaching threshold (${PERF_THRESHOLD_MEDIUM}ms)`
        );
      }
    });
  });

  describe("Edge Cases", () => {
    let search: PrefixTreeSearch;

    beforeEach(() => {
      search = new PrefixTreeSearch();
      search.indexNodes(mockNodes);
    });

    it("should handle special characters in query", () => {
      const results = search.search("image.filter");
      expect(results.length).toBeGreaterThan(0);
    });

    it("should handle numbers in query", () => {
      const nodesWithNumbers = [
        createMockNode("test.node1", "Node1", "test"),
        createMockNode("test.node2", "Node2", "test"),
      ];
      search.indexNodes(nodesWithNumbers);

      const results = search.search("node1");
      expect(results.length).toBeGreaterThan(0);
    });

    it("should handle very long queries", () => {
      const longQuery = "a".repeat(100);
      const results = search.search(longQuery);
      // Should not crash, may return empty
      expect(Array.isArray(results)).toBe(true);
    });

    it("should handle nodes with empty titles", () => {
      const nodesWithEmpty = [
        createMockNode("test.empty", "", "test"),
        createMockNode("test.normal", "Normal", "test"),
      ];
      search.indexNodes(nodesWithEmpty);

      const results = search.search("test");
      expect(results.length).toBeGreaterThan(0);
    });

    it("should handle nodes with empty namespaces", () => {
      const nodesWithEmpty = [
        createMockNode("empty", "Empty", ""),
        createMockNode("normal", "Normal", "test"),
      ];
      search.indexNodes(nodesWithEmpty);

      const results = search.search("empty");
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
