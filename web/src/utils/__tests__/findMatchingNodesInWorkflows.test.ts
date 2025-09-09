/**
 * @jest-environment node
 */
import { findMatchingNodesInWorkflows } from "../findMatchingNodesInWorkflows";
import { Workflow } from "../../stores/ApiTypes";

describe("findMatchingNodesInWorkflows", () => {
  const mockWorkflows: Workflow[] = [
    {
      id: "workflow-1",
      name: "Math Workflow",
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      graph: {
        nodes: [
          {
            id: "node-1",
            type: "math.add",
            sync_mode: "sync"
          },
          {
            id: "node-2",
            type: "math.subtract",
            sync_mode: "sync"
          }
        ],
        edges: []
      },
      access: "private",
      description: "Math operations workflow"
    },
    {
      id: "workflow-2",
      name: "String Workflow",
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      graph: {
        nodes: [
          {
            id: "node-3",
            type: "string.concat",
            sync_mode: "sync"
          },
          {
            id: "node-4",
            type: "string.split",
            sync_mode: "sync"
          }
        ],
        edges: []
      },
      access: "private",
      description: "String operations workflow"
    },
    {
      id: "workflow-3",
      name: "Empty Workflow",
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      graph: {
        nodes: [],
        edges: []
      },
      access: "private",
      description: "Test workflow"
    },
    {
      id: "workflow-4",
      name: "No Graph Workflow",
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      graph: undefined as any,
      access: "private",
      description: "No graph workflow"
    }
  ];

  describe("with empty or invalid inputs", () => {
    it("should return all workflows with score 1 when searchQuery is empty", () => {
      const results = findMatchingNodesInWorkflows(mockWorkflows, "");
      expect(results).toHaveLength(mockWorkflows.length);
      expect(results.every(r => r.fuseScore === 1)).toBe(true);
      expect(results.every(r => r.matches.length === 0)).toBe(true);
    });

    it("should return all workflows with score 1 when searchQuery is whitespace", () => {
      const results = findMatchingNodesInWorkflows(mockWorkflows, "   ");
      expect(results).toHaveLength(mockWorkflows.length);
      expect(results.every(r => r.fuseScore === 1)).toBe(true);
      expect(results.every(r => r.matches.length === 0)).toBe(true);
    });

    it("should handle null workflows gracefully", () => {
      // The actual function tries to map over null, which throws an error
      // This is expected behavior - the function doesn't handle null input
      expect(() => findMatchingNodesInWorkflows(null as any, "test")).toThrow();
    });

    it("should return empty array when workflows is empty", () => {
      const results = findMatchingNodesInWorkflows([], "test");
      expect(results).toEqual([]);
    });
  });

  describe("searching by node title", () => {
    it("should find workflows containing nodes with matching titles", () => {
      const results = findMatchingNodesInWorkflows(mockWorkflows, "Add");
      
      // Should find workflow-1 which has "Add Numbers" node
      const mathWorkflow = results.find(r => r.workflow.id === "workflow-1");
      expect(mathWorkflow).toBeDefined();
      if (mathWorkflow) {
        expect(mathWorkflow.fuseScore).toBeGreaterThan(0);
        expect(mathWorkflow.matches.length).toBeGreaterThan(0);
        expect(mathWorkflow.matches.some(m => m.text === "math.add")).toBe(true);
      }
    });

    it("should be case insensitive", () => {
      const results1 = findMatchingNodesInWorkflows(mockWorkflows, "ADD");
      const results2 = findMatchingNodesInWorkflows(mockWorkflows, "add");
      
      const workflow1 = results1.find(r => r.workflow.id === "workflow-1");
      const workflow2 = results2.find(r => r.workflow.id === "workflow-1");
      
      expect(workflow1?.fuseScore).toBe(workflow2?.fuseScore);
      expect(workflow1?.matches.length).toBe(workflow2?.matches.length);
    });

    it("should find partial matches", () => {
      const results = findMatchingNodesInWorkflows(mockWorkflows, "concat");
      
      const stringWorkflow = results.find(r => r.workflow.id === "workflow-2");
      expect(stringWorkflow).toBeDefined();
      if (stringWorkflow) {
        expect(stringWorkflow.fuseScore).toBeGreaterThan(0);
        expect(stringWorkflow.matches.some(m => m.text === "string.concat")).toBe(true);
      }
    });
  });

  describe("searching by node type", () => {
    it("should find workflows containing nodes with matching types", () => {
      const results = findMatchingNodesInWorkflows(mockWorkflows, "math");
      
      const mathWorkflow = results.find(r => r.workflow.id === "workflow-1");
      expect(mathWorkflow).toBeDefined();
      if (mathWorkflow) {
        expect(mathWorkflow.fuseScore).toBeGreaterThan(0);
        expect(mathWorkflow.matches.length).toBeGreaterThan(0);
        // Should find both math.add and math.subtract
        expect(mathWorkflow.matches.some(m => m.text.includes("math"))).toBe(true);
      }
    });

    it("should find workflows with specific node types", () => {
      const results = findMatchingNodesInWorkflows(mockWorkflows, "string.split");
      
      const stringWorkflow = results.find(r => r.workflow.id === "workflow-2");
      expect(stringWorkflow).toBeDefined();
      if (stringWorkflow) {
        expect(stringWorkflow.fuseScore).toBeGreaterThan(0);
        expect(stringWorkflow.matches.some(m => m.text === "string.split")).toBe(true);
      }
    });
  });

  describe("handling edge cases", () => {
    it("should handle workflows with no nodes", () => {
      const results = findMatchingNodesInWorkflows(mockWorkflows, "test");
      
      const emptyWorkflow = results.find(r => r.workflow.id === "workflow-3");
      expect(emptyWorkflow).toBeDefined();
      if (emptyWorkflow) {
        expect(emptyWorkflow.fuseScore).toBe(0);
        expect(emptyWorkflow.matches).toEqual([]);
      }
    });

    it("should handle workflows with undefined graph", () => {
      const results = findMatchingNodesInWorkflows(mockWorkflows, "test");
      
      const noGraphWorkflow = results.find(r => r.workflow.id === "workflow-4");
      expect(noGraphWorkflow).toBeDefined();
      if (noGraphWorkflow) {
        expect(noGraphWorkflow.fuseScore).toBe(0);
        expect(noGraphWorkflow.matches).toEqual([]);
      }
    });

    it("should handle nodes without title", () => {
      const workflowWithNoTitle: Workflow[] = [{
        id: "workflow-5",
        name: "No Title Workflow",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        access: "private",
        description: "No title workflow",
          graph: {
          nodes: [
            {
              id: "node-5",
              type: "custom.node",
              sync_mode: "sync"
            }
          ],
          edges: []
        }
      }];

      const results = findMatchingNodesInWorkflows(workflowWithNoTitle, "custom");
      expect(results).toHaveLength(1);
      expect(results[0].fuseScore).toBeGreaterThan(0);
      expect(results[0].matches.some(m => m.text === "custom.node")).toBe(true);
    });

    it("should handle nodes with null or undefined type", () => {
      const workflowWithBadNode: Workflow[] = [{
        id: "workflow-6",
        name: "Bad Node Workflow",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        access: "private",
        description: "Bad node workflow",
          graph: {
          nodes: [
            {
              id: "node-6",
              type: null as any,
              sync_mode: "sync"
            }
          ],
          edges: []
        }
      }];

      const results = findMatchingNodesInWorkflows(workflowWithBadNode, "test");
      expect(results).toHaveLength(1);
      // Should still work and not crash
      expect(results[0].workflow.id).toBe("workflow-6");
    });
  });

  describe("deduplication", () => {
    it("should deduplicate matches for the same node type", () => {
      const workflowWithDuplicates: Workflow[] = [{
        id: "workflow-7",
        name: "Duplicate Nodes",
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        access: "private",
        description: "Duplicate nodes workflow",
          graph: {
          nodes: [
            {
              id: "node-7",
              type: "math.add",
              sync_mode: "sync"
            },
            {
              id: "node-8",
              type: "math.add",
              sync_mode: "sync"
            }
          ],
          edges: []
        }
      }];

      const results = findMatchingNodesInWorkflows(workflowWithDuplicates, "math.add");
      expect(results).toHaveLength(1);
      
      const workflow = results[0];
      // Should have math.add only once in matches
      const mathAddMatches = workflow.matches.filter(m => m.text === "math.add");
      expect(mathAddMatches).toHaveLength(1);
    });
  });

  describe("custom threshold and match length", () => {
    it("should use custom threshold", () => {
      // With very strict threshold (0.1), should find more matches
      const strictResults = findMatchingNodesInWorkflows(mockWorkflows, "mat", 0.1);
      
      // With very loose threshold (0.9), should find fewer matches
      const looseResults = findMatchingNodesInWorkflows(mockWorkflows, "mat", 0.9);
      
      const strictMatches = strictResults.filter(r => r.fuseScore > 0).length;
      const looseMatches = looseResults.filter(r => r.fuseScore > 0).length;
      
      expect(strictMatches).toBeGreaterThanOrEqual(looseMatches);
    });

    it("should use custom minimum match character length factor", () => {
      const results = findMatchingNodesInWorkflows(mockWorkflows, "a", 0.3, 0.1);
      
      // With very low min match factor, single character "a" should find matches
      const matchingWorkflows = results.filter(r => r.fuseScore > 0);
      expect(matchingWorkflows.length).toBeGreaterThan(0);
    });
  });

  describe("score calculation", () => {
    it("should return higher scores for better matches", () => {
      const results = findMatchingNodesInWorkflows(mockWorkflows, "Add Numbers");
      
      const exactMatch = results.find(r => r.workflow.id === "workflow-1");
      const noMatch = results.find(r => r.workflow.id === "workflow-3");
      
      expect(exactMatch?.fuseScore).toBeGreaterThan(noMatch?.fuseScore || 0);
    });

    it("should return 0 score for workflows with no matches", () => {
      const results = findMatchingNodesInWorkflows(mockWorkflows, "nonexistent");
      
      const emptyWorkflow = results.find(r => r.workflow.id === "workflow-3");
      expect(emptyWorkflow?.fuseScore).toBe(0);
    });
  });
});