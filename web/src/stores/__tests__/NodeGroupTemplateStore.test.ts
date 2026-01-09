import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import { Node, Edge, Position } from "@xyflow/react";
import { useNodeGroupTemplateStore, NodeGroupTemplate } from "../NodeGroupTemplateStore";
import { NodeData } from "../NodeData";

const makeNode = (
  id: string,
  type: string = "test",
  x: number = 0,
  y: number = 0
): Node<NodeData> => ({
  id,
  type,
  position: { x, y },
  targetPosition: Position.Left,
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: "test-workflow"
  }
});

const makeEdge = (
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string
): Edge => ({
  id: `${source}-${target}`,
  source,
  target,
  sourceHandle: sourceHandle || null,
  targetHandle: targetHandle || null
});

describe("NodeGroupTemplateStore", () => {
  beforeEach(() => {
    act(() => {
      useNodeGroupTemplateStore.setState({ templates: [] });
    });
    localStorage.removeItem("nodetool-node-group-templates");
  });

  describe("addTemplate", () => {
    it("should add a template with generated id", async () => {
      const templateId = await act(async () => {
        return useNodeGroupTemplateStore.getState().addTemplate({
          name: "Test Template",
          description: "A test template",
          nodes: [],
          edges: []
        });
      });

      expect(templateId).toBeDefined();
      expect(templateId.startsWith("template-")).toBe(true);

      const templates = useNodeGroupTemplateStore.getState().templates;
      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe("Test Template");
    });

    it("should add createdAt and updatedAt timestamps", async () => {
      const beforeTime = Date.now();
      await act(async () => {
        await useNodeGroupTemplateStore.getState().addTemplate({
          name: "Test Template",
          description: "",
          nodes: [],
          edges: []
        });
      });
      const afterTime = Date.now();

      const templates = useNodeGroupTemplateStore.getState().templates;
      expect(templates[0].createdAt).toBeGreaterThanOrEqual(beforeTime);
      expect(templates[0].createdAt).toBeLessThanOrEqual(afterTime);
      expect(templates[0].updatedAt).toBeGreaterThanOrEqual(beforeTime);
      expect(templates[0].usageCount).toBe(0);
    });

    it("should store nodes and edges correctly", async () => {
      const nodes: Node<NodeData>[] = [makeNode("node1", "test", 10, 20), makeNode("node2", "test", 100, 200)];
      const edges: Edge[] = [makeEdge("node1", "node2")];

      await act(async () => {
        await useNodeGroupTemplateStore.getState().createTemplateFromSelection(
          "Test Template",
          "",
          nodes,
          edges
        );
      });

      const templates = useNodeGroupTemplateStore.getState().templates;
      expect(templates[0].nodes).toHaveLength(2);
      expect(templates[0].edges).toHaveLength(1);
    });
  });

  describe("updateTemplate", () => {
    it("should update template properties", async () => {
      const templateId = await act(async () => {
        return useNodeGroupTemplateStore.getState().addTemplate({
          name: "Original Name",
          description: "Original description",
          nodes: [],
          edges: []
        });
      });

      await act(async () => {
        await useNodeGroupTemplateStore.getState().updateTemplate(templateId, {
          name: "Updated Name",
          description: "Updated description"
        });
      });

      const template = useNodeGroupTemplateStore.getState().getTemplate(templateId);
      expect(template?.name).toBe("Updated Name");
      expect(template?.description).toBe("Updated description");
    });

    it("should update updatedAt timestamp", async () => {
      const templateId = await act(async () => {
        return useNodeGroupTemplateStore.getState().addTemplate({
          name: "Test",
          description: "",
          nodes: [],
          edges: []
        });
      });

      const originalUpdatedAt = useNodeGroupTemplateStore.getState().getTemplate(templateId)?.updatedAt;

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        await useNodeGroupTemplateStore.getState().updateTemplate(templateId, { name: "Updated" });
      });

      const updatedTemplate = useNodeGroupTemplateStore.getState().getTemplate(templateId);
      expect(updatedTemplate?.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt!);
    });
  });

  describe("deleteTemplate", () => {
    it("should remove template from store", async () => {
      const templateId = await act(async () => {
        return useNodeGroupTemplateStore.getState().addTemplate({
          name: "Test Template",
          description: "",
          nodes: [],
          edges: []
        });
      });

      expect(useNodeGroupTemplateStore.getState().templates).toHaveLength(1);

      await act(async () => {
        await useNodeGroupTemplateStore.getState().deleteTemplate(templateId);
      });

      expect(useNodeGroupTemplateStore.getState().templates).toHaveLength(0);
    });

    it("should handle deleting non-existent template gracefully", async () => {
      await act(async () => {
        await useNodeGroupTemplateStore.getState().deleteTemplate("non-existent-id");
      });

      expect(useNodeGroupTemplateStore.getState().templates).toHaveLength(0);
    });
  });

  describe("getTemplate", () => {
    it("should return undefined for non-existent template", () => {
      const result = useNodeGroupTemplateStore.getState().getTemplate("non-existent-id");
      expect(result).toBeUndefined();
    });

    it("should return the correct template", async () => {
      const templateId = await act(async () => {
        return useNodeGroupTemplateStore.getState().addTemplate({
          name: "Test Template",
          description: "",
          nodes: [],
          edges: []
        });
      });

      const template = useNodeGroupTemplateStore.getState().getTemplate(templateId);
      expect(template).toBeDefined();
      expect(template?.name).toBe("Test Template");
    });
  });

  describe("getTemplates", () => {
    it("should return all templates", async () => {
      await act(async () => {
        await useNodeGroupTemplateStore.getState().addTemplate({
          name: "Template 1",
          description: "",
          nodes: [],
          edges: []
        });
        await useNodeGroupTemplateStore.getState().addTemplate({
          name: "Template 2",
          description: "",
          nodes: [],
          edges: []
        });
      });

      const templates = useNodeGroupTemplateStore.getState().getTemplates();
      expect(templates).toHaveLength(2);
    });

    it("should return empty array when no templates exist", () => {
      const templates = useNodeGroupTemplateStore.getState().getTemplates();
      expect(templates).toHaveLength(0);
    });
  });

  describe("incrementUsageCount", () => {
    it("should increment usage count", async () => {
      const templateId = await act(async () => {
        return useNodeGroupTemplateStore.getState().addTemplate({
          name: "Test Template",
          description: "",
          nodes: [],
          edges: []
        });
      });

      await act(async () => {
        await useNodeGroupTemplateStore.getState().incrementUsageCount(templateId);
      });

      let template = useNodeGroupTemplateStore.getState().getTemplate(templateId);
      expect(template?.usageCount).toBe(1);

      await act(async () => {
        await useNodeGroupTemplateStore.getState().incrementUsageCount(templateId);
      });

      template = useNodeGroupTemplateStore.getState().getTemplate(templateId);
      expect(template?.usageCount).toBe(2);
    });
  });

  describe("createTemplateFromSelection", () => {
    it("should create template from selected nodes and edges", async () => {
      const nodes: Node<NodeData>[] = [makeNode("node1", "test", 100, 200), makeNode("node2", "test", 300, 400)];
      const edges = [makeEdge("node1", "node2")];

      const templateId = await act(async () => {
        return useNodeGroupTemplateStore.getState().createTemplateFromSelection(
          "Selection Template",
          "Created from selection",
          nodes,
          edges
        );
      });

      const template = useNodeGroupTemplateStore.getState().getTemplate(templateId);
      expect(template).toBeDefined();
      expect(template?.name).toBe("Selection Template");
      expect(template?.description).toBe("Created from selection");
      expect(template?.nodes).toHaveLength(2);
      expect(template?.edges).toHaveLength(1);
    });

    it("should normalize node positions relative to top-left node", async () => {
      const nodes: Node<NodeData>[] = [
        makeNode("node1", "test", 100, 200),
        makeNode("node2", "test", 300, 400),
        makeNode("node3", "test", 150, 250)
      ];

      const templateId = await act(async () => {
        return useNodeGroupTemplateStore.getState().createTemplateFromSelection(
          "Normalized Template",
          "",
          nodes,
          []
        );
      });

      const templates = useNodeGroupTemplateStore.getState().templates;
      const template = templates[0];

      expect(template.nodes[0].position.x).toBe(0);
      expect(template.nodes[0].position.y).toBe(0);
      expect(template.nodes[1].position.x).toBe(200);
      expect(template.nodes[1].position.y).toBe(200);
      expect(template.nodes[2].position.x).toBe(50);
      expect(template.nodes[2].position.y).toBe(50);
    });

    it("should generate new unique IDs for nodes", async () => {
      const nodes: Node<NodeData>[] = [makeNode("node1", "test"), makeNode("node2", "test")];

      const templateId = await act(async () => {
        return useNodeGroupTemplateStore.getState().createTemplateFromSelection(
          "Template",
          "",
          nodes,
          []
        );
      });

      const template = useNodeGroupTemplateStore.getState().getTemplate(templateId);
      expect(template?.nodes[0].id).not.toBe("node1");
      expect(template?.nodes[1].id).not.toBe("node2");
      expect(template?.nodes[0].id).not.toBe(template?.nodes[1].id);
    });
  });

  describe("dialog state", () => {
    it("should manage dialog open state", () => {
      expect(useNodeGroupTemplateStore.getState().isDialogOpen).toBe(false);

      act(() => {
        useNodeGroupTemplateStore.getState().setDialogOpen(true);
      });

      expect(useNodeGroupTemplateStore.getState().isDialogOpen).toBe(true);

      act(() => {
        useNodeGroupTemplateStore.getState().setDialogOpen(false);
      });

      expect(useNodeGroupTemplateStore.getState().isDialogOpen).toBe(false);
    });

    it("should manage insert position", () => {
      expect(useNodeGroupTemplateStore.getState().insertPosition).toBeNull();

      act(() => {
        useNodeGroupTemplateStore.getState().setInsertPosition({ x: 100, y: 200 });
      });

      expect(useNodeGroupTemplateStore.getState().insertPosition).toEqual({ x: 100, y: 200 });

      act(() => {
        useNodeGroupTemplateStore.getState().setInsertPosition(null);
      });

      expect(useNodeGroupTemplateStore.getState().insertPosition).toBeNull();
    });
  });
});
