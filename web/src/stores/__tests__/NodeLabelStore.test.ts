import { renderHook, act } from "@testing-library/react";
import { useNodeLabelStore, NodeLabel } from "../NodeLabelStore";

describe("NodeLabelStore", () => {
  beforeEach(() => {
    act(() => {
      useNodeLabelStore.setState({
        labels: {
          "label-red": { id: "label-red", name: "Important", color: "#ef4444" },
          "label-blue": { id: "label-blue", name: "Input", color: "#3b82f6" },
        },
        assignments: {},
        labelOrder: ["label-red", "label-blue"],
      });
    });
  });

  describe("createLabel", () => {
    it("creates a new label with unique id", () => {
      const { result } = renderHook(() => useNodeLabelStore());
      let labelId: string | undefined;
      act(() => {
        labelId = result.current.createLabel("Test Label", "#ff0000");
      });
      expect(labelId).toBeDefined();
      expect(labelId?.startsWith("label-")).toBe(true);
      expect(labelId?.length).toBeGreaterThan(10);
      act(() => {
        const labels = result.current.labels;
        expect(labels[labelId!]).toEqual({
          id: labelId,
          name: "Test Label",
          color: "#ff0000",
        });
      });
    });
  });

  describe("updateLabel", () => {
    it("updates existing label name and color", () => {
      const { result } = renderHook(() => useNodeLabelStore());
      act(() => {
        result.current.updateLabel("label-red", "Updated Name", "#00ff00");
      });
      act(() => {
        const label = result.current.labels["label-red"];
        expect(label.name).toBe("Updated Name");
        expect(label.color).toBe("#00ff00");
      });
    });
  });

  describe("deleteLabel", () => {
    it("removes label and clears assignments", () => {
      const { result } = renderHook(() => useNodeLabelStore());
      act(() => {
        result.current.assignLabel("node-1", "label-red");
        result.current.deleteLabel("label-red");
      });
      act(() => {
        expect(result.current.labels["label-red"]).toBeUndefined();
        expect(result.current.assignments["node-1"]).toEqual([]);
      });
    });
  });

  describe("assignLabel", () => {
    it("adds label to node", () => {
      const { result } = renderHook(() => useNodeLabelStore());
      act(() => {
        result.current.assignLabel("node-1", "label-red");
      });
      act(() => {
        expect(result.current.assignments["node-1"]).toEqual(["label-red"]);
      });
    });

    it("does not duplicate label assignments", () => {
      const { result } = renderHook(() => useNodeLabelStore());
      act(() => {
        result.current.assignLabel("node-1", "label-red");
        result.current.assignLabel("node-1", "label-red");
      });
      act(() => {
        expect(result.current.assignments["node-1"]).toEqual(["label-red"]);
        expect(result.current.assignments["node-1"].length).toBe(1);
      });
    });
  });

  describe("removeLabel", () => {
    it("removes label from node", () => {
      const { result } = renderHook(() => useNodeLabelStore());
      act(() => {
        result.current.assignLabel("node-1", "label-red");
        result.current.assignLabel("node-1", "label-blue");
        result.current.removeLabel("node-1", "label-red");
      });
      act(() => {
        expect(result.current.assignments["node-1"]).toEqual(["label-blue"]);
      });
    });
  });

  describe("getLabelsForNode", () => {
    it("returns all labels for a node", () => {
      const { result } = renderHook(() => useNodeLabelStore());
      act(() => {
        result.current.assignLabel("node-1", "label-red");
        result.current.assignLabel("node-1", "label-blue");
      });
      act(() => {
        const labels = result.current.getLabelsForNode("node-1");
        expect(labels).toHaveLength(2);
        expect(labels.map((l) => l.name).sort()).toEqual(["Important", "Input"]);
      });
    });

    it("returns empty array for unlabeled node", () => {
      const { result } = renderHook(() => useNodeLabelStore());
      act(() => {
        const labels = result.current.getLabelsForNode("unlabeled-node");
        expect(labels).toEqual([]);
      });
    });
  });

  describe("getNodesWithLabel", () => {
    it("returns all nodes with a specific label", () => {
      const { result } = renderHook(() => useNodeLabelStore());
      act(() => {
        result.current.assignLabel("node-1", "label-red");
        result.current.assignLabel("node-2", "label-red");
        result.current.assignLabel("node-3", "label-blue");
      });
      act(() => {
        const nodes = result.current.getNodesWithLabel("label-red");
        expect(nodes.sort()).toEqual(["node-1", "node-2"]);
      });
    });
  });

  describe("isNodeLabeled", () => {
    it("returns true for labeled node", () => {
      const { result } = renderHook(() => useNodeLabelStore());
      act(() => {
        result.current.assignLabel("node-1", "label-red");
      });
      act(() => {
        expect(result.current.isNodeLabeled("node-1")).toBe(true);
      });
    });

    it("returns false for unlabeled node", () => {
      const { result } = renderHook(() => useNodeLabelStore());
      act(() => {
        expect(result.current.isNodeLabeled("node-1")).toBe(false);
      });
    });
  });

  describe("clearLabels", () => {
    it("removes all labels from a node", () => {
      const { result } = renderHook(() => useNodeLabelStore());
      act(() => {
        result.current.assignLabel("node-1", "label-red");
        result.current.assignLabel("node-1", "label-blue");
        result.current.clearLabels("node-1");
      });
      act(() => {
        expect(result.current.isNodeLabeled("node-1")).toBe(false);
      });
    });
  });
});
