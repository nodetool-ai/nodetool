import { describe, it, expect } from "@jest/globals";
import { searchWorkflows } from "../workflowSearch";
import { Workflow } from "../../stores/ApiTypes";

// Mock workflow data
const mockWorkflows: Workflow[] = [
  {
    id: "1",
    name: "Image Processing Pipeline",
    description: "A workflow for processing and resizing images",
    graph: { nodes: [], edges: [] },
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
    thumbnail: "",
    thumbnail_url: "",
    author: "",
    downloads: 0,
    author_email: "",
    access: "private"
  },
  {
    id: "2",
    name: "Text Analysis",
    description: "Analyzes text sentiment and extracts keywords",
    graph: { nodes: [], edges: [] },
    created_at: "2024-01-02",
    updated_at: "2024-01-02",
    thumbnail: "",
    thumbnail_url: "",
    author: "",
    downloads: 0,
    author_email: "",
    access: "private"
  },
  {
    id: "3",
    name: "Data Transformation",
    description: "Transforms CSV data into JSON format",
    graph: { nodes: [], edges: [] },
    created_at: "2024-01-03",
    updated_at: "2024-01-03",
    thumbnail: "",
    thumbnail_url: "",
    author: "",
    downloads: 0,
    author_email: "",
    access: "private"
  },
  {
    id: "4",
    name: "Audio Processing",
    description: "Process audio files with noise reduction",
    graph: { nodes: [], edges: [] },
    created_at: "2024-01-04",
    updated_at: "2024-01-04",
    thumbnail: "",
    thumbnail_url: "",
    author: "",
    downloads: 0,
    author_email: "",
    access: "private"
  }
];

describe("workflowSearch", () => {
  describe("searchWorkflows", () => {
    it("should return all workflows when query is empty", () => {
      const results = searchWorkflows(mockWorkflows, "");
      expect(results).toHaveLength(mockWorkflows.length);
      results.forEach((result, index) => {
        expect(result.workflow).toBe(mockWorkflows[index]);
        expect(result.fuseScore).toBe(1);
        expect(result.matches).toEqual([]);
      });
    });

    it("should return all workflows when query is only whitespace", () => {
      const results = searchWorkflows(mockWorkflows, "   ");
      expect(results).toHaveLength(mockWorkflows.length);
      results.forEach((result) => {
        expect(result.fuseScore).toBe(1);
        expect(result.matches).toEqual([]);
      });
    });

    it("should find workflows by exact name match", () => {
      const results = searchWorkflows(mockWorkflows, "Image Processing");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].workflow.name).toBe("Image Processing Pipeline");
      expect(results[0].fuseScore).toBeGreaterThan(0);
    });

    it("should find workflows by partial name match", () => {
      const results = searchWorkflows(mockWorkflows, "Process");
      expect(results.length).toBeGreaterThan(0);
      const names = results.map(r => r.workflow.name);
      expect(names).toContain("Image Processing Pipeline");
      expect(names).toContain("Audio Processing");
    });

    it("should find workflows by description match", () => {
      const results = searchWorkflows(mockWorkflows, "sentiment");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].workflow.name).toBe("Text Analysis");
    });

    it("should prioritize name matches over description matches", () => {
      const results = searchWorkflows(mockWorkflows, "Analysis");
      expect(results.length).toBeGreaterThan(0);
      // Name match should come first due to higher weight
      expect(results[0].workflow.name).toBe("Text Analysis");
    });

    it("should handle case-insensitive search", () => {
      const resultsLower = searchWorkflows(mockWorkflows, "image");
      const resultsUpper = searchWorkflows(mockWorkflows, "IMAGE");
      const resultsMixed = searchWorkflows(mockWorkflows, "ImAgE");
      
      expect(resultsLower.length).toBeGreaterThan(0);
      expect(resultsUpper.length).toBe(resultsLower.length);
      expect(resultsMixed.length).toBe(resultsLower.length);
    });

    it("should return matches with score and match details", () => {
      const results = searchWorkflows(mockWorkflows, "Data");
      expect(results.length).toBeGreaterThan(0);
      const firstResult = results[0];
      expect(firstResult.workflow.name).toBe("Data Transformation");
      expect(firstResult.fuseScore).toBeGreaterThan(0);
      expect(firstResult.fuseScore).toBeLessThanOrEqual(1);
      expect(firstResult.matches).toBeDefined();
      expect(Array.isArray(firstResult.matches)).toBe(true);
    });

    it("should handle multi-word search", () => {
      const results = searchWorkflows(mockWorkflows, "text keyword");
      expect(results.length).toBeGreaterThan(0);
      // Should find workflows containing both words
      expect(results[0].workflow.name).toBe("Text Analysis");
    });

    it("should handle no matches", () => {
      const results = searchWorkflows(mockWorkflows, "xyz123nonexistent");
      expect(results).toEqual([]);
    });

    it("should handle empty workflow array", () => {
      const results = searchWorkflows([], "test");
      expect(results).toEqual([]);
    });

    it("should extract unique matches", () => {
      const results = searchWorkflows(mockWorkflows, "Processing");
      expect(results.length).toBeGreaterThan(0);
      
      results.forEach(result => {
        // Check that matches are unique
        const matchTexts = result.matches.map(m => m.text);
        const uniqueTexts = [...new Set(matchTexts)];
        expect(matchTexts.length).toBe(uniqueTexts.length);
      });
    });

    it("should handle special characters in query", () => {
      const specialWorkflows: Workflow[] = [
        {
          ...mockWorkflows[0],
          name: "Test@Workflow",
          description: "Contains special@characters"
        }
      ];
      
      const results = searchWorkflows(specialWorkflows, "@");
      // Fuse.js handles special characters, should return results or empty array
      expect(Array.isArray(results)).toBe(true);
    });

    it("should handle very long queries", () => {
      const longQuery = "a".repeat(500);
      const results = searchWorkflows(mockWorkflows, longQuery);
      expect(Array.isArray(results)).toBe(true);
    });

    it("should correctly calculate fuse score", () => {
      const results = searchWorkflows(mockWorkflows, "Image Processing Pipeline");
      expect(results.length).toBeGreaterThan(0);
      // Exact match should have high score
      expect(results[0].fuseScore).toBeGreaterThan(0.8);
    });

    it("should handle workflows with missing fields", () => {
      const incompleteWorkflows: Workflow[] = [
        {
          ...mockWorkflows[0],
          name: "",
          description: "Workflow with empty name"
        },
        {
          ...mockWorkflows[1],
          name: "Workflow with no description",
          description: ""
        }
      ];
      
      const results = searchWorkflows(incompleteWorkflows, "Workflow");
      expect(results.length).toBeGreaterThan(0);
    });

    it("should handle path-like text in matches", () => {
      const pathWorkflows: Workflow[] = [
        {
          ...mockWorkflows[0],
          name: "path/to/workflow.json",
          description: "A workflow with path-like name"
        }
      ];
      
      const results = searchWorkflows(pathWorkflows, "workflow");
      expect(results.length).toBeGreaterThan(0);
      // Should extract the last part of the path
      const matchTexts = results[0].matches.map(m => m.text);
      expect(matchTexts.some(text => text.includes("workflow") || text.includes("json"))).toBe(true);
    });
  });
});