import { act } from "@testing-library/react";
import useValidationStore, { NodeWarning } from "../ValidationStore";

describe("ValidationStore", () => {
  beforeEach(() => {
    useValidationStore.setState({ warnings: {} });
  });

  describe("initial state", () => {
    it("has empty warnings object", () => {
      const { warnings } = useValidationStore.getState();
      expect(warnings).toEqual({});
    });
  });

  describe("setWarnings", () => {
    it("sets warnings for a specific node", () => {
      const testWarnings: NodeWarning[] = [
        {
          nodeId: "node1",
          type: "missing_input",
          message: "Required input is not connected",
          handle: "text_input"
        }
      ];

      act(() => {
        useValidationStore.getState().setWarnings("workflow1", "node1", testWarnings);
      });

      const warnings = useValidationStore.getState().getWarnings("workflow1", "node1");
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe("missing_input");
      expect(warnings[0].handle).toBe("text_input");
    });

    it("sets warnings for multiple nodes", () => {
      const warnings1: NodeWarning[] = [
        { nodeId: "node1", type: "missing_input", message: "Missing input" }
      ];
      const warnings2: NodeWarning[] = [
        { nodeId: "node2", type: "missing_property", message: "Missing property", property: "model" }
      ];

      act(() => {
        useValidationStore.getState().setWarnings("workflow1", "node1", warnings1);
        useValidationStore.getState().setWarnings("workflow1", "node2", warnings2);
        useValidationStore.getState().setWarnings("workflow2", "node1", warnings1);
      });

      expect(useValidationStore.getState().getWarnings("workflow1", "node1")).toHaveLength(1);
      expect(useValidationStore.getState().getWarnings("workflow1", "node2")).toHaveLength(1);
      expect(useValidationStore.getState().getWarnings("workflow2", "node1")).toHaveLength(1);
    });

    it("overwrites existing warnings for same node", () => {
      const warnings1: NodeWarning[] = [
        { nodeId: "node1", type: "missing_input", message: "First warning" }
      ];
      const warnings2: NodeWarning[] = [
        { nodeId: "node1", type: "missing_property", message: "Second warning", property: "name" }
      ];

      act(() => {
        useValidationStore.getState().setWarnings("workflow1", "node1", warnings1);
        useValidationStore.getState().setWarnings("workflow1", "node1", warnings2);
      });

      const warnings = useValidationStore.getState().getWarnings("workflow1", "node1");
      expect(warnings).toHaveLength(1);
      expect(warnings[0].type).toBe("missing_property");
    });

    it("stores multiple warnings for a single node", () => {
      const multipleWarnings: NodeWarning[] = [
        { nodeId: "node1", type: "missing_input", message: "Input 1 missing", handle: "input1" },
        { nodeId: "node1", type: "missing_input", message: "Input 2 missing", handle: "input2" },
        { nodeId: "node1", type: "missing_property", message: "Property missing", property: "threshold" }
      ];

      act(() => {
        useValidationStore.getState().setWarnings("workflow1", "node1", multipleWarnings);
      });

      const warnings = useValidationStore.getState().getWarnings("workflow1", "node1");
      expect(warnings).toHaveLength(3);
    });

    it("clears warnings when passed empty array", () => {
      const warnings: NodeWarning[] = [
        { nodeId: "node1", type: "missing_input", message: "Warning" }
      ];

      act(() => {
        useValidationStore.getState().setWarnings("workflow1", "node1", warnings);
        useValidationStore.getState().setWarnings("workflow1", "node1", []);
      });

      const result = useValidationStore.getState().getWarnings("workflow1", "node1");
      expect(result).toHaveLength(0);
    });
  });

  describe("getWarnings", () => {
    it("returns warnings for a specific node", () => {
      const testWarnings: NodeWarning[] = [
        { nodeId: "node1", type: "missing_input", message: "Test warning" }
      ];

      act(() => {
        useValidationStore.getState().setWarnings("workflow1", "node1", testWarnings);
      });

      const warnings = useValidationStore.getState().getWarnings("workflow1", "node1");
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toBe("Test warning");
    });

    it("returns empty array for non-existent node", () => {
      const warnings = useValidationStore.getState().getWarnings("workflow1", "non-existent");
      expect(warnings).toEqual([]);
    });

    it("distinguishes between workflows", () => {
      const warnings1: NodeWarning[] = [
        { nodeId: "node1", type: "missing_input", message: "Warning in workflow 1" }
      ];
      const warnings2: NodeWarning[] = [
        { nodeId: "node1", type: "missing_property", message: "Warning in workflow 2" }
      ];

      act(() => {
        useValidationStore.getState().setWarnings("workflow1", "node1", warnings1);
        useValidationStore.getState().setWarnings("workflow2", "node1", warnings2);
      });

      expect(useValidationStore.getState().getWarnings("workflow1", "node1")[0].message).toBe("Warning in workflow 1");
      expect(useValidationStore.getState().getWarnings("workflow2", "node1")[0].message).toBe("Warning in workflow 2");
    });
  });

  describe("getAllWarnings", () => {
    it("returns all warnings for a workflow", () => {
      const warnings1: NodeWarning[] = [
        { nodeId: "node1", type: "missing_input", message: "Warning 1" }
      ];
      const warnings2: NodeWarning[] = [
        { nodeId: "node2", type: "missing_property", message: "Warning 2" }
      ];

      act(() => {
        useValidationStore.getState().setWarnings("workflow1", "node1", warnings1);
        useValidationStore.getState().setWarnings("workflow1", "node2", warnings2);
        useValidationStore.getState().setWarnings("workflow2", "node1", warnings1);
      });

      const allWarnings = useValidationStore.getState().getAllWarnings("workflow1");
      expect(allWarnings).toHaveLength(2);
    });
  });

  describe("hasWarnings", () => {
    it("returns true when node has warnings", () => {
      const warnings: NodeWarning[] = [
        { nodeId: "node1", type: "missing_input", message: "Warning" }
      ];

      act(() => {
        useValidationStore.getState().setWarnings("workflow1", "node1", warnings);
      });

      expect(useValidationStore.getState().hasWarnings("workflow1", "node1")).toBe(true);
    });

    it("returns false when node has no warnings", () => {
      expect(useValidationStore.getState().hasWarnings("workflow1", "node1")).toBe(false);
    });

    it("returns false when warnings are cleared", () => {
      const warnings: NodeWarning[] = [
        { nodeId: "node1", type: "missing_input", message: "Warning" }
      ];

      act(() => {
        useValidationStore.getState().setWarnings("workflow1", "node1", warnings);
        useValidationStore.getState().setWarnings("workflow1", "node1", []);
      });

      expect(useValidationStore.getState().hasWarnings("workflow1", "node1")).toBe(false);
    });
  });

  describe("clearNodeWarnings", () => {
    it("clears warnings for a specific node", () => {
      const warnings1: NodeWarning[] = [
        { nodeId: "node1", type: "missing_input", message: "Warning 1" }
      ];
      const warnings2: NodeWarning[] = [
        { nodeId: "node2", type: "missing_property", message: "Warning 2" }
      ];

      act(() => {
        useValidationStore.getState().setWarnings("workflow1", "node1", warnings1);
        useValidationStore.getState().setWarnings("workflow1", "node2", warnings2);
        useValidationStore.getState().clearNodeWarnings("workflow1", "node1");
      });

      expect(useValidationStore.getState().getWarnings("workflow1", "node1")).toHaveLength(0);
      expect(useValidationStore.getState().getWarnings("workflow1", "node2")).toHaveLength(1);
    });

    it("does nothing if node has no warnings", () => {
      const warnings: NodeWarning[] = [
        { nodeId: "node1", type: "missing_input", message: "Warning" }
      ];

      act(() => {
        useValidationStore.getState().setWarnings("workflow1", "node1", warnings);
        useValidationStore.getState().clearNodeWarnings("workflow1", "non-existent");
      });

      expect(useValidationStore.getState().getWarnings("workflow1", "node1")).toHaveLength(1);
    });

    it("only clears warnings for specified workflow", () => {
      const warnings: NodeWarning[] = [
        { nodeId: "node1", type: "missing_input", message: "Warning" }
      ];

      act(() => {
        useValidationStore.getState().setWarnings("workflow1", "node1", warnings);
        useValidationStore.getState().setWarnings("workflow2", "node1", warnings);
        useValidationStore.getState().clearNodeWarnings("workflow1", "node1");
      });

      expect(useValidationStore.getState().getWarnings("workflow1", "node1")).toHaveLength(0);
      expect(useValidationStore.getState().getWarnings("workflow2", "node1")).toHaveLength(1);
    });
  });

  describe("clearWarnings", () => {
    it("clears all warnings for a workflow", () => {
      act(() => {
        useValidationStore.getState().setWarnings("workflow1", "node1", [
          { nodeId: "node1", type: "missing_input", message: "Warning 1" }
        ]);
        useValidationStore.getState().setWarnings("workflow1", "node2", [
          { nodeId: "node2", type: "missing_property", message: "Warning 2" }
        ]);
        useValidationStore.getState().clearWarnings("workflow1");
      });

      expect(useValidationStore.getState().getAllWarnings("workflow1")).toHaveLength(0);
    });

    it("does not affect other workflows", () => {
      act(() => {
        useValidationStore.getState().setWarnings("workflow1", "node1", [
          { nodeId: "node1", type: "missing_input", message: "Warning" }
        ]);
        useValidationStore.getState().setWarnings("workflow2", "node1", [
          { nodeId: "node1", type: "missing_input", message: "Warning" }
        ]);
        useValidationStore.getState().clearWarnings("workflow1");
      });

      expect(useValidationStore.getState().getAllWarnings("workflow1")).toHaveLength(0);
      expect(useValidationStore.getState().getAllWarnings("workflow2")).toHaveLength(1);
    });

    it("does nothing if workflow has no warnings", () => {
      act(() => {
        useValidationStore.getState().setWarnings("workflow1", "node1", [
          { nodeId: "node1", type: "missing_input", message: "Warning" }
        ]);
        useValidationStore.getState().clearWarnings("non-existent");
      });

      expect(useValidationStore.getState().getWarnings("workflow1", "node1")).toHaveLength(1);
    });
  });

  describe("key hashing", () => {
    it("uses workflowId:nodeId format for keys", () => {
      act(() => {
        useValidationStore.getState().setWarnings("wf1", "n1", [
          { nodeId: "n1", type: "missing_input", message: "Warning" }
        ]);
      });

      const warnings = useValidationStore.getState().warnings;
      expect(Object.keys(warnings)).toContain("wf1:n1");
    });

    it("handles special characters in IDs", () => {
      act(() => {
        useValidationStore.getState().setWarnings("workflow-with-dashes", "node_with_underscores", [
          { nodeId: "node_with_underscores", type: "missing_input", message: "Warning" }
        ]);
      });

      const warnings = useValidationStore.getState().getWarnings("workflow-with-dashes", "node_with_underscores");
      expect(warnings).toHaveLength(1);
    });

    it("handles UUIDs as IDs", () => {
      const workflowId = "550e8400-e29b-41d4-a716-446655440000";
      const nodeId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

      act(() => {
        useValidationStore.getState().setWarnings(workflowId, nodeId, [
          { nodeId: nodeId, type: "missing_input", message: "Warning" }
        ]);
      });

      const warnings = useValidationStore.getState().getWarnings(workflowId, nodeId);
      expect(warnings).toHaveLength(1);
    });
  });

  describe("integration scenarios", () => {
    it("supports validation of workflow with multiple issues", () => {
      const workflowId = "test-workflow";

      act(() => {
        useValidationStore.getState().setWarnings(workflowId, "input-node", [
          { nodeId: "input-node", type: "missing_property", message: "Name required", property: "name" }
        ]);
        useValidationStore.getState().setWarnings(workflowId, "process-node", [
          { nodeId: "process-node", type: "missing_input", message: "Text input required", handle: "text" },
          { nodeId: "process-node", type: "missing_input", message: "Image input required", handle: "image" }
        ]);
        useValidationStore.getState().setWarnings(workflowId, "output-node", []);
      });

      expect(useValidationStore.getState().hasWarnings(workflowId, "input-node")).toBe(true);
      expect(useValidationStore.getState().hasWarnings(workflowId, "process-node")).toBe(true);
      expect(useValidationStore.getState().hasWarnings(workflowId, "output-node")).toBe(false);

      const allWarnings = useValidationStore.getState().getAllWarnings(workflowId);
      expect(allWarnings).toHaveLength(3);

      act(() => {
        useValidationStore.getState().clearWarnings(workflowId);
      });

      expect(useValidationStore.getState().getAllWarnings(workflowId)).toHaveLength(0);
    });

    it("supports multiple concurrent workflows", () => {
      act(() => {
        useValidationStore.getState().setWarnings("workflow1", "nodeA", [
          { nodeId: "nodeA", type: "missing_input", message: "Warning A1" }
        ]);
        useValidationStore.getState().setWarnings("workflow1", "nodeB", [
          { nodeId: "nodeB", type: "missing_property", message: "Warning B1", property: "model" }
        ]);
        useValidationStore.getState().setWarnings("workflow2", "nodeA", [
          { nodeId: "nodeA", type: "missing_input", message: "Warning A2" }
        ]);
        useValidationStore.getState().setWarnings("workflow2", "nodeB", [
          { nodeId: "nodeB", type: "missing_property", message: "Warning B2", property: "threshold" }
        ]);
      });

      expect(useValidationStore.getState().getAllWarnings("workflow1")).toHaveLength(2);
      expect(useValidationStore.getState().getAllWarnings("workflow2")).toHaveLength(2);

      act(() => {
        useValidationStore.getState().clearWarnings("workflow1");
      });

      expect(useValidationStore.getState().getAllWarnings("workflow1")).toHaveLength(0);
      expect(useValidationStore.getState().getAllWarnings("workflow2")).toHaveLength(2);
    });
  });
});
