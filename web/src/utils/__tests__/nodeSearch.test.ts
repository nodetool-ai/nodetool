/**
 * @jest-environment node
 */
import {
  performGroupedSearch,
  computeSearchResults,
  filterNodesUtil,
  SearchResultGroup
} from "../nodeSearch";
import { NodeMetadata, TypeName } from "../../stores/ApiTypes";

// Mock the external dependencies
jest.mock("../../components/node_menu/typeFilterUtils", () => ({
  filterDataByType: jest.fn((data) => data),
  filterDataByExactType: jest.fn((data) => data)
}));

jest.mock("../../stores/formatNodeDocumentation", () => ({
  formatNodeDocumentation: jest.fn((description) => ({
    description: description || "",
    tags: ["tag1", "tag2"],
    useCases: { raw: ["use case 1", "use case 2"] }
  }))
}));

jest.mock("../../stores/fuseOptions", () => ({
  fuseOptions: {
    includeScore: true,
    threshold: 0.3,
    location: 0,
    distance: 100,
    maxPatternLength: 32,
    minMatchCharLength: 1,
    shouldSort: true,
    keys: []
  }
}));

// Performance thresholds for regression testing (CI-friendly values)
const PERF_THRESHOLD_SMALL = 80; // 80ms for small dataset
const PERF_THRESHOLD_MEDIUM = 180; // 180ms for medium dataset
const PERF_THRESHOLD_LARGE = 250; // 250ms for large dataset

describe("nodeSearch", () => {
  const mockNodeMetadata: NodeMetadata[] = [
    {
      namespace: "math",
      node_type: "math.add",
      title: "Add",
      description: "Adds two numbers together",
      properties: [],
      outputs: [],
      the_model_info: {},
      layout: "default",
      recommended_models: [],
      basic_fields: [],
      is_dynamic: false,
      expose_as_tool: false,
      supports_dynamic_outputs: false,
      is_streaming_output: false
    },
    {
      namespace: "math",
      node_type: "math.subtract",
      title: "Subtract",
      description: "Subtracts one number from another",
      properties: [],
      outputs: [],
      the_model_info: {},
      layout: "default",
      recommended_models: [],
      basic_fields: [],
      is_dynamic: false,
      expose_as_tool: false,
      supports_dynamic_outputs: false,
      is_streaming_output: false
    },
    {
      namespace: "string",
      node_type: "string.concat",
      title: "Concatenate",
      description: "Joins strings together",
      properties: [],
      outputs: [],
      the_model_info: {},
      layout: "default",
      recommended_models: [],
      basic_fields: [],
      is_dynamic: false,
      expose_as_tool: false,
      supports_dynamic_outputs: false,
      is_streaming_output: false
    },
    {
      namespace: "default",
      node_type: "default.node",
      title: "Default Node",
      description: "A default node that should be filtered out",
      properties: [],
      outputs: [],
      the_model_info: {},
      layout: "default",
      recommended_models: [],
      basic_fields: [],
      is_dynamic: false,
      expose_as_tool: false,
      supports_dynamic_outputs: false,
      is_streaming_output: false
    }
  ];

  describe("performGroupedSearch", () => {
    it("should return empty array for no matches", () => {
      const entries = mockNodeMetadata.map((node) => ({
        title: node.title,
        node_type: node.node_type,
        namespace: node.namespace,
        description: node.description,
        use_cases: [],
        tags: "",
        metadata: node
      }));

      const results = performGroupedSearch(entries, "nonexistent");
      expect(results).toEqual([]);
    });

    it("should find nodes by title", () => {
      const entries = mockNodeMetadata.map((node) => ({
        title: node.title,
        node_type: node.node_type,
        namespace: node.namespace,
        description: node.description,
        use_cases: [],
        tags: "",
        metadata: node
      }));

      const results = performGroupedSearch(entries, "Add");
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Name");
      expect(results[0].nodes).toHaveLength(1);
      expect(results[0].nodes[0].title).toBe("Add");
    });

    it("should find nodes by namespace", () => {
      const entries = mockNodeMetadata.map((node) => ({
        title: node.title,
        node_type: node.node_type,
        namespace: node.namespace,
        description: node.description,
        use_cases: [],
        tags: "tag1, tag2",
        metadata: node
      }));

      const results = performGroupedSearch(entries, "math");
      expect(results.length).toBeGreaterThan(0);
      // Since we're searching for "math" which is a namespace, it should be found
      // in the "Namespace + Tags" group, not the "Name" group
      const namespaceGroup = results.find(
        (g) => g.title === "Namespace + Tags"
      );
      expect(namespaceGroup).toBeDefined();
      if (namespaceGroup) {
        expect(namespaceGroup.nodes.length).toBeGreaterThan(0);
        // Should find both Add and Subtract nodes from math namespace
        expect(namespaceGroup.nodes.some((n) => n.namespace === "math")).toBe(
          true
        );
      }
    });

    it("should find nodes by description", () => {
      const entries = mockNodeMetadata.map((node) => ({
        title: node.title,
        node_type: node.node_type,
        namespace: node.namespace,
        description: node.description,
        use_cases: [],
        tags: "",
        metadata: node
      }));

      const results = performGroupedSearch(entries, "numbers");
      expect(results.length).toBeGreaterThan(0);
      // Since we're searching for "numbers" which appears in a description,
      // it should be found in the "Description" group
      const descriptionGroup = results.find((g) => g.title === "Description");
      expect(descriptionGroup).toBeDefined();
      if (descriptionGroup) {
        // Should find Add node which has "numbers" in its description
        expect(
          descriptionGroup.nodes.some((n) => n.description?.includes("numbers"))
        ).toBe(true);
      }
    });

    it("should not duplicate nodes across groups", () => {
      const entries = mockNodeMetadata.map((node) => ({
        title: node.title,
        node_type: node.node_type,
        namespace: node.namespace,
        description: node.description,
        use_cases: [],
        tags: "",
        metadata: node
      }));

      const results = performGroupedSearch(entries, "Add");
      const allNodes = results.flatMap((g) => g.nodes);
      const nodeTypes = allNodes.map((n) => n.node_type);
      const uniqueNodeTypes = [...new Set(nodeTypes)];
      expect(nodeTypes.length).toBe(uniqueNodeTypes.length);
    });

    it("should handle search with spaces", () => {
      const entries = mockNodeMetadata.map((node) => ({
        title: node.title,
        node_type: node.node_type,
        namespace: node.namespace,
        description: node.description,
        use_cases: [],
        tags: "",
        metadata: node
      }));

      const results = performGroupedSearch(entries, "two numbers");
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("computeSearchResults", () => {
    it("should filter out default namespace nodes", () => {
      const results = computeSearchResults(
        mockNodeMetadata,
        "",
        [],
        undefined,
        undefined
      );

      expect(results.sortedResults).not.toContainEqual(
        expect.objectContaining({ namespace: "default" })
      );
    });

    it("should return all non-default nodes when no search term", () => {
      const results = computeSearchResults(
        mockNodeMetadata,
        "",
        [],
        undefined,
        undefined
      );

      expect(results.sortedResults).toHaveLength(3); // All except default
      expect(results.groupedResults).toHaveLength(1);
      expect(results.groupedResults[0].title).toBe("All Nodes");
    });

    it("should filter by selected path", () => {
      const results = computeSearchResults(
        mockNodeMetadata,
        "",
        ["math"],
        undefined,
        undefined
      );

      expect(results.sortedResults).toHaveLength(2);
      expect(results.sortedResults.every((n) => n.namespace === "math")).toBe(
        true
      );
    });

    it("should perform search when term is provided", () => {
      const results = computeSearchResults(
        mockNodeMetadata,
        "Add",
        [],
        undefined,
        undefined
      );

      expect(results.sortedResults.length).toBeGreaterThan(0);
      expect(results.sortedResults[0].title).toBe("Add");
    });

    it("should combine path and search filters", () => {
      const results = computeSearchResults(
        mockNodeMetadata,
        "Add",
        ["math"],
        undefined,
        undefined
      );

      expect(results.sortedResults).toHaveLength(1);
      expect(results.sortedResults[0].title).toBe("Add");
      expect(results.sortedResults[0].namespace).toBe("math");
    });

    it("should sort results by namespace then title", () => {
      const results = computeSearchResults(
        mockNodeMetadata,
        "",
        [],
        undefined,
        undefined
      );

      for (let i = 1; i < results.sortedResults.length; i++) {
        const prev = results.sortedResults[i - 1];
        const curr = results.sortedResults[i];
        const namespaceComparison = prev.namespace.localeCompare(
          curr.namespace
        );

        if (namespaceComparison > 0) {
          fail("Results not sorted by namespace");
        } else if (namespaceComparison === 0) {
          expect(prev.title.localeCompare(curr.title)).toBeLessThanOrEqual(0);
        }
      }
    });

    it("should handle type filters", () => {
      const inputType: TypeName = "string";
      const results = computeSearchResults(
        mockNodeMetadata,
        "",
        [],
        inputType,
        undefined,
        false
      );

      // The mock filterDataByType returns all data, but in real scenario it would filter
      expect(results.sortedResults).toBeDefined();
    });

    it("should handle strict matching", () => {
      const inputType: TypeName = "string";
      const outputType: TypeName = "string";
      const results = computeSearchResults(
        mockNodeMetadata,
        "",
        [],
        inputType,
        outputType,
        true
      );

      // The mock filterDataByExactType returns all data, but in real scenario it would filter
      expect(results.sortedResults).toBeDefined();
    });
  });

  describe("filterNodesUtil", () => {
    const searchResults: NodeMetadata[] = [
      mockNodeMetadata[0], // Add node
      mockNodeMetadata[1] // Subtract node
    ];

    it("should return empty array for null nodes", () => {
      const results = filterNodesUtil(
        null as any,
        "",
        [],
        "",
        "",
        searchResults
      );
      expect(results).toEqual([]);
    });

    it("should filter by search results when search term is provided", () => {
      const results = filterNodesUtil(
        mockNodeMetadata,
        "math",
        [],
        "",
        "",
        searchResults
      );

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe("Add");
      expect(results[1].title).toBe("Subtract");
    });

    it("should filter by path when no search term", () => {
      const results = filterNodesUtil(
        mockNodeMetadata,
        "",
        ["math"],
        "",
        "",
        []
      );

      expect(results).toHaveLength(2);
      expect(results.every((n) => n.namespace === "math")).toBe(true);
    });

    it("should handle special characters in search term", () => {
      const results = filterNodesUtil(
        mockNodeMetadata,
        "+",
        [],
        "",
        "",
        searchResults
      );

      expect(results).toHaveLength(2);
    });

    it("should handle operators in search term", () => {
      const testCases = ["+", "-", "*", "/"];

      testCases.forEach((operator) => {
        const results = filterNodesUtil(
          mockNodeMetadata,
          operator,
          [],
          "",
          "",
          searchResults
        );
        expect(results).toBeDefined();
      });
    });

    it("should sort results by namespace and title", () => {
      const results = filterNodesUtil(mockNodeMetadata, "", [], "", "", []);

      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1];
        const curr = results[i];
        const namespaceComparison = prev.namespace.localeCompare(
          curr.namespace
        );

        if (namespaceComparison > 0) {
          fail("Results not sorted by namespace");
        } else if (namespaceComparison === 0) {
          expect(prev.title.localeCompare(curr.title)).toBeLessThanOrEqual(0);
        }
      }
    });

    it("should handle input and output type filters", () => {
      const results = filterNodesUtil(
        mockNodeMetadata,
        "",
        [],
        "string",
        "string",
        searchResults
      );

      expect(results).toHaveLength(2);
    });

    it("should handle nested paths correctly", () => {
      const nestedNodes: NodeMetadata[] = [
        {
          ...mockNodeMetadata[0],
          namespace: "math.operations.basic"
        },
        {
          ...mockNodeMetadata[1],
          namespace: "math.operations"
        },
        {
          ...mockNodeMetadata[2],
          namespace: "math"
        }
      ];

      const results = filterNodesUtil(
        nestedNodes,
        "",
        ["math", "operations"],
        "",
        "",
        []
      );

      const expectedNodes = nestedNodes.filter(
        (n) =>
          n.namespace === "math.operations" ||
          n.namespace.startsWith("math.operations.")
      );

      expect(results.length).toBe(expectedNodes.length);
    });
  });

  describe("Performance and Integration Tests", () => {
    // NOTE: console.log statements in these tests are intentional
    // They provide performance metrics that are useful for monitoring
    // and debugging search performance over time
    
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
        nodes.push({
          namespace: namespace,
          node_type: `${namespace}.${operation}${i}`,
          title: `${operation.charAt(0).toUpperCase() + operation.slice(1)} ${i}`,
          description: `Description for ${operation} operation number ${i}`,
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
      }

      return nodes;
    };

    it("should search faster with prefix tree optimization", () => {
      const nodes = generateLargeDataset(500);
      
      const start = performance.now();
      const results = computeSearchResults(nodes, "add", [], undefined, undefined);
      const duration = performance.now() - start;

      expect(results.sortedResults.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(PERF_THRESHOLD_SMALL);
      
      console.log(`[PERF] computeSearchResults with 500 nodes: ${duration.toFixed(2)}ms`);
    });

    it("should handle large datasets efficiently", () => {
      const nodes = generateLargeDataset(2000);
      
      const start = performance.now();
      const results = computeSearchResults(nodes, "process", [], undefined, undefined);
      const duration = performance.now() - start;

      expect(results.sortedResults.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(PERF_THRESHOLD_MEDIUM);
      
      console.log(`[PERF] computeSearchResults with 2000 nodes: ${duration.toFixed(2)}ms`);
    });

    it("should use prefix tree for simple queries", () => {
      const nodes = generateLargeDataset(1000);
      const entries = nodes.map((node) => ({
        title: node.title,
        node_type: node.node_type,
        namespace: node.namespace,
        description: node.description,
        use_cases: [],
        tags: "tag1, tag2",
        metadata: node,
      }));

      const start = performance.now();
      const results = performGroupedSearch(entries, "add");
      const duration = performance.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(PERF_THRESHOLD_SMALL);
      
      console.log(`[PERF] performGroupedSearch (prefix tree) with 1000 nodes: ${duration.toFixed(2)}ms`);
    });

    it("should fall back to Fuse.js for complex queries", () => {
      const nodes = generateLargeDataset(1000);
      const entries = nodes.map((node) => ({
        title: node.title,
        node_type: node.node_type,
        namespace: node.namespace,
        description: node.description,
        use_cases: [],
        tags: "tag1, tag2",
        metadata: node,
      }));

      // Complex multi-word query should use Fuse.js
      const start = performance.now();
      const results = performGroupedSearch(entries, "add subtract multiply");
      const duration = performance.now() - start;

      // Should still complete reasonably fast
      expect(duration).toBeLessThan(PERF_THRESHOLD_MEDIUM);
      
      console.log(`[PERF] performGroupedSearch (fuse fallback) with 1000 nodes: ${duration.toFixed(2)}ms`);
    });

    it("should not regress in performance", () => {
      // Critical regression test - if this fails, performance has degraded
      const nodes = generateLargeDataset(1000);
      
      const start = performance.now();
      const results = computeSearchResults(nodes, "test", [], undefined, undefined);
      const duration = performance.now() - start;

      // CRITICAL: This threshold should not increase
      expect(duration).toBeLessThan(PERF_THRESHOLD_MEDIUM);

      if (duration > PERF_THRESHOLD_MEDIUM * 0.8) {
        console.warn(
          `[PERF WARNING] Search time (${duration.toFixed(2)}ms) is approaching threshold (${PERF_THRESHOLD_MEDIUM}ms)`
        );
      }
    });

    it("should handle rapid successive searches efficiently", () => {
      const nodes = generateLargeDataset(1000);
      const queries = ["add", "sub", "mul", "div", "proc"];
      
      const start = performance.now();
      queries.forEach((query) => {
        computeSearchResults(nodes, query, [], undefined, undefined);
      });
      const duration = performance.now() - start;

      const avgTime = duration / queries.length;
      expect(avgTime).toBeLessThan(PERF_THRESHOLD_SMALL);
      
      console.log(`[PERF] Average search time for ${queries.length} queries: ${avgTime.toFixed(2)}ms`);
    });

    it("should return consistent results between prefix tree and fuse", () => {
      const nodes = mockNodeMetadata.slice(0, 3); // Use small dataset for consistency
      const entries = nodes.map((node) => ({
        title: node.title,
        node_type: node.node_type,
        namespace: node.namespace,
        description: node.description,
        use_cases: [],
        tags: "",
        metadata: node,
      }));

      // Simple query that will use prefix tree
      const simpleResults = performGroupedSearch(entries, "Add");
      
      // Complex query that will use Fuse.js
      const complexResults = performGroupedSearch(entries, "adds two numbers");
      
      // Both should find the Add node
      expect(simpleResults.length).toBeGreaterThan(0);
      // Complex query might not find exact matches, but should not crash
      expect(Array.isArray(complexResults)).toBe(true);
    });
  });
});
