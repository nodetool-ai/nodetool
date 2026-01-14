import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import { useNodeLabelStore } from "../NodeLabelStore";

const TEST_WORKFLOW_ID = "test-workflow";

describe("NodeLabelStore", () => {
  beforeEach(() => {
    act(() => {
      useNodeLabelStore.setState({ labels: {}, currentWorkflowId: null });
      useNodeLabelStore.getState().setCurrentWorkflowId(TEST_WORKFLOW_ID);
    });
  });

  describe("addLabel", () => {
    it("should add a label to a node", () => {
      act(() => {
        const labelId = useNodeLabelStore.getState().addLabel("node1", "Important");
        expect(labelId).toMatch(/^label_\d+_[a-z0-9]+$/);
      });

      const labels = useNodeLabelStore.getState().getLabels("node1");
      expect(labels).toHaveLength(1);
      expect(labels[0].text).toBe("Important");
    });

    it("should assign a color based on text", () => {
      act(() => {
        useNodeLabelStore.getState().addLabel("node1", "Test");
      });

      const labels = useNodeLabelStore.getState().getLabels("node1");
      expect(labels[0].color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it("should accept a custom color", () => {
      act(() => {
        useNodeLabelStore.getState().addLabel("node1", "Urgent", "#ff0000");
      });

      const labels = useNodeLabelStore.getState().getLabels("node1");
      expect(labels[0].color).toBe("#ff0000");
    });

    it("should truncate labels longer than 30 characters", () => {
      const longText = "This is a very long label that exceeds thirty characters";
      act(() => {
        useNodeLabelStore.getState().addLabel("node1", longText);
      });

      const labels = useNodeLabelStore.getState().getLabels("node1");
      expect(labels[0].text.length).toBe(30);
    });

    it("should trim whitespace from labels", () => {
      act(() => {
        useNodeLabelStore.getState().addLabel("node1", "  Spaced  ");
      });

      const labels = useNodeLabelStore.getState().getLabels("node1");
      expect(labels[0].text).toBe("Spaced");
    });

    it("should add multiple labels to the same node", () => {
      act(() => {
        useNodeLabelStore.getState().addLabel("node1", "Label 1");
        useNodeLabelStore.getState().addLabel("node1", "Label 2");
        useNodeLabelStore.getState().addLabel("node1", "Label 3");
      });

      const labels = useNodeLabelStore.getState().getLabels("node1");
      expect(labels).toHaveLength(3);
    });

    it("should limit labels per node to 5", () => {
      act(() => {
        for (let i = 0; i < 7; i++) {
          useNodeLabelStore.getState().addLabel("node1", `Label ${i}`);
        }
      });

      const labels = useNodeLabelStore.getState().getLabels("node1");
      expect(labels).toHaveLength(5);
    });

    it("should create unique IDs for each label", () => {
      act(() => {
        const id1 = useNodeLabelStore.getState().addLabel("node1", "Label 1");
        const id2 = useNodeLabelStore.getState().addLabel("node1", "Label 2");
        expect(id1).not.toBe(id2);
      });
    });
  });

  describe("removeLabel", () => {
    it("should remove a label by ID", () => {
      act(() => {
        const labelId = useNodeLabelStore.getState().addLabel("node1", "To Remove");
        useNodeLabelStore.getState().removeLabel("node1", labelId);
      });

      const labels = useNodeLabelStore.getState().getLabels("node1");
      expect(labels).toHaveLength(0);
    });

    it("should not affect other labels on the same node", () => {
      act(() => {
        useNodeLabelStore.getState().addLabel("node1", "Keep");
        const removeId = useNodeLabelStore.getState().addLabel("node1", "Remove");
        useNodeLabelStore.getState().addLabel("node1", "Also Keep");
        useNodeLabelStore.getState().removeLabel("node1", removeId);
      });

      const labels = useNodeLabelStore.getState().getLabels("node1");
      expect(labels).toHaveLength(2);
      expect(labels.map((l) => l.text)).toEqual(["Keep", "Also Keep"]);
    });

    it("should handle removing non-existent label gracefully", () => {
      act(() => {
        useNodeLabelStore.getState().removeLabel("node1", "non-existent-id");
      });

      expect(useNodeLabelStore.getState().getLabels("node1")).toHaveLength(0);
    });
  });

  describe("updateLabel", () => {
    it("should update label text", () => {
      let labelId: string;
      act(() => {
        labelId = useNodeLabelStore.getState().addLabel("node1", "Original");
        useNodeLabelStore.getState().updateLabel("node1", labelId, "Updated");
      });

      const labels = useNodeLabelStore.getState().getLabels("node1");
      expect(labels[0].text).toBe("Updated");
    });

    it("should update label color", () => {
      let labelId: string;
      act(() => {
        labelId = useNodeLabelStore.getState().addLabel("node1", "Test");
        useNodeLabelStore.getState().updateLabel("node1", labelId, "Test", "#00ff00");
      });

      const labels = useNodeLabelStore.getState().getLabels("node1");
      expect(labels[0].color).toBe("#00ff00");
    });

    it("should truncate updated label text to 30 characters", () => {
      let labelId: string;
      const longText = "This is a very long updated text that exceeds thirty characters";
      act(() => {
        labelId = useNodeLabelStore.getState().addLabel("node1", "Original");
        useNodeLabelStore.getState().updateLabel("node1", labelId, longText);
      });

      const labels = useNodeLabelStore.getState().getLabels("node1");
      expect(labels[0].text.length).toBe(30);
    });
  });

  describe("getLabels", () => {
    it("should return empty array for node with no labels", () => {
      const labels = useNodeLabelStore.getState().getLabels("node1");
      expect(labels).toEqual([]);
    });

    it("should return all labels for a node", () => {
      act(() => {
        useNodeLabelStore.getState().addLabel("node1", "Label 1");
        useNodeLabelStore.getState().addLabel("node1", "Label 2");
      });

      const labels = useNodeLabelStore.getState().getLabels("node1");
      expect(labels).toHaveLength(2);
    });
  });

  describe("hasLabels", () => {
    it("should return false for node with no labels", () => {
      expect(useNodeLabelStore.getState().hasLabels("node1")).toBe(false);
    });

    it("should return true for node with labels", () => {
      act(() => {
        useNodeLabelStore.getState().addLabel("node1", "Test");
      });

      expect(useNodeLabelStore.getState().hasLabels("node1")).toBe(true);
    });
  });

  describe("getAllLabels", () => {
    it("should return all labels across all nodes", () => {
      act(() => {
        useNodeLabelStore.getState().addLabel("node1", "Node 1 Label");
        useNodeLabelStore.getState().addLabel("node2", "Node 2 Label 1");
        useNodeLabelStore.getState().addLabel("node2", "Node 2 Label 2");
      });

      const allLabels = useNodeLabelStore.getState().getAllLabels();
      expect(allLabels).toHaveLength(3);
    });

    it("should return correct nodeId for each label", () => {
      act(() => {
        useNodeLabelStore.getState().addLabel("node1", "Label 1");
        useNodeLabelStore.getState().addLabel("node2", "Label 2");
      });

      const allLabels = useNodeLabelStore.getState().getAllLabels();
      expect(allLabels.find((l) => l.label.text === "Label 1")?.nodeId).toBe("node1");
      expect(allLabels.find((l) => l.label.text === "Label 2")?.nodeId).toBe("node2");
    });
  });

  describe("getNodesWithLabels", () => {
    it("should return nodes that have at least one label", () => {
      act(() => {
        useNodeLabelStore.getState().addLabel("node1", "Label");
        useNodeLabelStore.getState().addLabel("node3", "Label");
      });

      const nodes = useNodeLabelStore.getState().getNodesWithLabels();
      expect(nodes).toHaveLength(2);
      expect(nodes).toContain("node1");
      expect(nodes).toContain("node3");
    });

    it("should not return nodes without labels", () => {
      act(() => {
        useNodeLabelStore.getState().addLabel("node1", "Label");
      });

      const nodes = useNodeLabelStore.getState().getNodesWithLabels();
      expect(nodes).not.toContain("node2");
    });
  });

  describe("clearLabels", () => {
    it("should remove all labels", () => {
      act(() => {
        useNodeLabelStore.getState().addLabel("node1", "Label 1");
        useNodeLabelStore.getState().addLabel("node2", "Label 2");
        useNodeLabelStore.getState().clearLabels();
      });

      const allLabels = useNodeLabelStore.getState().getAllLabels();
      expect(allLabels).toHaveLength(0);
    });
  });

  describe("workflow isolation", () => {
    it("should track different workflows separately", () => {
      useNodeLabelStore.getState().setCurrentWorkflowId("workflow1");
      act(() => {
        useNodeLabelStore.getState().addLabel("node1", "Workflow 1 Label");
      });

      useNodeLabelStore.getState().setCurrentWorkflowId("workflow2");
      act(() => {
        useNodeLabelStore.getState().addLabel("node1", "Workflow 2 Label");
      });

      useNodeLabelStore.getState().setCurrentWorkflowId("workflow1");
      let labels = useNodeLabelStore.getState().getLabels("node1");
      expect(labels).toHaveLength(1);
      expect(labels[0].text).toBe("Workflow 1 Label");

      useNodeLabelStore.getState().setCurrentWorkflowId("workflow2");
      labels = useNodeLabelStore.getState().getLabels("node1");
      expect(labels).toHaveLength(1);
      expect(labels[0].text).toBe("Workflow 2 Label");
    });
  });
});
