import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import { useNodeTemplatesStore } from "../NodeTemplatesStore";
import { NodeData } from "../NodeData";
import { Node } from "@xyflow/react";

const createMockNodeData = (): NodeData => ({
  properties: {},
  selectable: true,
  dynamic_properties: {},
  workflow_id: "test-workflow"
});

// Helper to create a minimal mock node
const createMockNode = (
  id: string,
  type: string,
  x: number,
  y: number,
  data?: Partial<NodeData>
): Node<NodeData> => {
  const nodeData = { ...createMockNodeData(), ...data };
  return {
    id,
    type,
    position: { x, y },
    data: nodeData,
    selected: false,
    dragging: false
  } as Node<NodeData>;
};

describe("NodeTemplatesStore", () => {
  beforeEach(() => {
    act(() => {
      useNodeTemplatesStore.setState({ templates: [] });
    });
    localStorage.removeItem("nodetool-node-templates");
  });

  describe("addTemplate", () => {
    it("should add a template with selected nodes", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.test.Input", 100, 100),
        createMockNode("2", "nodetool.test.Output", 200, 100),
      ];

      act(() => {
        const templateId = useNodeTemplatesStore.getState().addTemplate(
          "Test Template",
          "A test template",
          nodes
        );
        expect(templateId).toBeDefined();
        expect(typeof templateId).toBe("string");
      });

      const templates = useNodeTemplatesStore.getState().templates;
      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe("Test Template");
      expect(templates[0].description).toBe("A test template");
      expect(templates[0].nodes).toHaveLength(2);
    });

    it("should store nodes with relative positions", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.test.Node1", 150, 200),
        createMockNode("2", "nodetool.test.Node2", 350, 400),
      ];

      act(() => {
        useNodeTemplatesStore.getState().addTemplate("Relative Test", undefined, nodes);
      });

      const templates = useNodeTemplatesStore.getState().templates;
      expect(templates[0].nodes[0].position.x).toBe(0);
      expect(templates[0].nodes[0].position.y).toBe(0);
      expect(templates[0].nodes[1].position.x).toBe(200);
      expect(templates[0].nodes[1].position.y).toBe(200);
    });

    it("should preserve node data in template", () => {
      const customData: Partial<NodeData> = { 
        title: "Custom Title",
        color: "#ff0000"
      };
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.test.Node", 100, 100, customData),
      ];

      act(() => {
        useNodeTemplatesStore.getState().addTemplate("Data Test", undefined, nodes);
      });

      const templates = useNodeTemplatesStore.getState().templates;
      expect(templates[0].nodes[0].data.title).toBe("Custom Title");
      expect(templates[0].nodes[0].data.color).toBe("#ff0000");
    });

    it("should generate new IDs for template nodes", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("original-1", "nodetool.test.Node", 100, 100),
        createMockNode("original-2", "nodetool.test.Node", 200, 100),
      ];

      act(() => {
        useNodeTemplatesStore.getState().addTemplate("ID Test", undefined, nodes);
      });

      const templates = useNodeTemplatesStore.getState().templates;
      const templateNodes = templates[0].nodes;
      
      expect(templateNodes[0].id).not.toBe("original-1");
      expect(templateNodes[1].id).not.toBe("original-2");
      expect(templateNodes[0].id.length).toBeGreaterThan(0);
      expect(templateNodes[1].id.length).toBeGreaterThan(0);
    });

    it("should set createdAt and updatedAt timestamps", () => {
      const beforeAdd = Date.now();
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.test.Node", 100, 100),
      ];

      act(() => {
        useNodeTemplatesStore.getState().addTemplate("Timestamp Test", undefined, nodes);
      });

      const afterAdd = Date.now();
      const templates = useNodeTemplatesStore.getState().templates;
      
      expect(templates[0].createdAt).toBeGreaterThanOrEqual(beforeAdd);
      expect(templates[0].createdAt).toBeLessThanOrEqual(afterAdd);
      expect(templates[0].updatedAt).toBeGreaterThanOrEqual(beforeAdd);
      expect(templates[0].updatedAt).toBeLessThanOrEqual(afterAdd);
    });
  });

  describe("updateTemplate", () => {
    it("should update template name and description", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.test.Node", 100, 100),
      ];

      let templateId: string | undefined;
      act(() => {
        templateId = useNodeTemplatesStore.getState().addTemplate(
          "Original Name",
          undefined,
          nodes
        );
      });

      act(() => {
        if (templateId) {
          useNodeTemplatesStore.getState().updateTemplate(
            templateId,
            "Updated Name",
            "Updated description",
            nodes
          );
        }
      });

      const templates = useNodeTemplatesStore.getState().templates;
      expect(templates[0].name).toBe("Updated Name");
      expect(templates[0].description).toBe("Updated description");
    });

    it("should update template nodes", () => {
      const originalNodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.test.Node1", 100, 100),
      ];
      
      const updatedNodes: Node<NodeData>[] = [
        createMockNode("2", "nodetool.test.Node2", 150, 150),
      ];

      let templateId: string | undefined;
      act(() => {
        templateId = useNodeTemplatesStore.getState().addTemplate(
          "Update Nodes Test",
          undefined,
          originalNodes
        );
      });

      act(() => {
        if (templateId) {
          useNodeTemplatesStore.getState().updateTemplate(
            templateId,
            "Update Nodes Test",
            undefined,
            updatedNodes
          );
        }
      });

      const templates = useNodeTemplatesStore.getState().templates;
      expect(templates[0].nodes).toHaveLength(1);
      expect(templates[0].nodes[0].type).toBe("nodetool.test.Node2");
    });

    it("should update updatedAt timestamp", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.test.Node", 100, 100),
      ];

      let templateId: string | undefined;
      act(() => {
        templateId = useNodeTemplatesStore.getState().addTemplate(
          "Timestamp Update Test",
          undefined,
          nodes
        );
      });

      const originalUpdatedAt = useNodeTemplatesStore.getState().templates[0]?.updatedAt ?? 0;
      
      // Wait a bit to ensure timestamp difference
      const start = Date.now();
      while (Date.now() - start < 10) {
        // Intentionally empty - just waiting for time to pass
      }

      act(() => {
        if (templateId) {
          useNodeTemplatesStore.getState().updateTemplate(
            templateId,
            "Timestamp Update Test",
            undefined,
            nodes
          );
        }
      });

      const templates = useNodeTemplatesStore.getState().templates;
      expect(templates[0]?.updatedAt).toBeGreaterThan(originalUpdatedAt);
    });
  });

  describe("deleteTemplate", () => {
    it("should remove template by ID", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.test.Node", 100, 100),
      ];

      let templateId: string | undefined;
      act(() => {
        templateId = useNodeTemplatesStore.getState().addTemplate("Delete Test", undefined, nodes);
      });

      expect(useNodeTemplatesStore.getState().templates).toHaveLength(1);

      act(() => {
        if (templateId) {
          useNodeTemplatesStore.getState().deleteTemplate(templateId);
        }
      });

      expect(useNodeTemplatesStore.getState().templates).toHaveLength(0);
    });

    it("should handle deleting non-existent template gracefully", () => {
      act(() => {
        useNodeTemplatesStore.getState().deleteTemplate("non-existent-id");
      });

      expect(useNodeTemplatesStore.getState().templates).toHaveLength(0);
    });
  });

  describe("getTemplates", () => {
    it("should return all templates", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.test.Node", 100, 100),
      ];

      act(() => {
        useNodeTemplatesStore.getState().addTemplate("Template 1", undefined, nodes);
        useNodeTemplatesStore.getState().addTemplate("Template 2", undefined, nodes);
      });

      const templates = useNodeTemplatesStore.getState().getTemplates();
      expect(templates).toHaveLength(2);
      expect(templates[0].name).toBe("Template 1");
      expect(templates[1].name).toBe("Template 2");
    });

    it("should return empty array when no templates", () => {
      const templates = useNodeTemplatesStore.getState().getTemplates();
      expect(templates).toHaveLength(0);
    });
  });

  describe("getTemplate", () => {
    it("should return template by ID", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.test.Node", 100, 100),
      ];

      let templateId: string | undefined;
      act(() => {
        templateId = useNodeTemplatesStore.getState().addTemplate(
          "Get Test",
          "Test description",
          nodes
        );
      });

      const template = templateId ? useNodeTemplatesStore.getState().getTemplate(templateId) : undefined;
      expect(template).toBeDefined();
      expect(template?.name).toBe("Get Test");
      expect(template?.description).toBe("Test description");
    });

    it("should return undefined for non-existent ID", () => {
      const template = useNodeTemplatesStore.getState().getTemplate("non-existent-id");
      expect(template).toBeUndefined();
    });
  });

  describe("persistence", () => {
    it("should persist templates to localStorage", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.test.Node", 100, 100),
      ];

      act(() => {
        useNodeTemplatesStore.getState().addTemplate("Persist Test", undefined, nodes);
      });

      const storageData = localStorage.getItem("nodetool-node-templates");
      expect(storageData).not.toBeNull();
      
      if (storageData) {
        const parsed = JSON.parse(storageData);
        expect(parsed.state.templates).toHaveLength(1);
        expect(parsed.state.templates[0].name).toBe("Persist Test");
      }
    });

    it("should handle multiple templates in persistence", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.test.Node", 100, 100),
      ];

      act(() => {
        useNodeTemplatesStore.getState().addTemplate("Multi 1", undefined, nodes);
        useNodeTemplatesStore.getState().addTemplate("Multi 2", undefined, nodes);
        useNodeTemplatesStore.getState().addTemplate("Multi 3", undefined, nodes);
      });

      const storageData = localStorage.getItem("nodetool-node-templates");
      expect(storageData).not.toBeNull();
      
      if (storageData) {
        const parsed = JSON.parse(storageData);
        expect(parsed.state.templates).toHaveLength(3);
      }
    });
  });

  describe("edge cases", () => {
    it("should handle template with single node", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.test.SingleNode", 100, 100),
      ];

      act(() => {
        useNodeTemplatesStore.getState().addTemplate("Single Node", undefined, nodes);
      });

      const templates = useNodeTemplatesStore.getState().templates;
      expect(templates).toHaveLength(1);
      expect(templates[0].nodes).toHaveLength(1);
      expect(templates[0].nodes[0].position.x).toBe(0);
      expect(templates[0].nodes[0].position.y).toBe(0);
    });

    it("should handle template with many nodes", () => {
      const nodes: Node<NodeData>[] = [];
      for (let i = 0; i < 20; i++) {
        nodes.push(createMockNode(`${i}`, "nodetool.test.Node", i * 50, i * 50));
      }

      act(() => {
        useNodeTemplatesStore.getState().addTemplate("Many Nodes", undefined, nodes);
      });

      const templates = useNodeTemplatesStore.getState().templates;
      expect(templates).toHaveLength(1);
      expect(templates[0].nodes).toHaveLength(20);
    });

    it("should handle empty description", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.test.Node", 100, 100),
      ];

      act(() => {
        useNodeTemplatesStore.getState().addTemplate("No Description", "", nodes);
      });

      const templates = useNodeTemplatesStore.getState().templates;
      expect(templates[0].description).toBe("");
    });

    it("should handle nodes with same positions", () => {
      const nodes: Node<NodeData>[] = [
        createMockNode("1", "nodetool.test.Node1", 100, 100),
        createMockNode("2", "nodetool.test.Node2", 100, 100),
      ];

      act(() => {
        useNodeTemplatesStore.getState().addTemplate("Same Position", undefined, nodes);
      });

      const templates = useNodeTemplatesStore.getState().templates;
      expect(templates[0].nodes[0].position.x).toBe(0);
      expect(templates[0].nodes[0].position.y).toBe(0);
      expect(templates[0].nodes[1].position.x).toBe(0);
      expect(templates[0].nodes[1].position.y).toBe(0);
    });
  });
});
