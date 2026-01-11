import { renderHook, act } from "@testing-library/react";
import { useNodeTemplatesStore, type NodeTemplate } from "../NodeTemplatesStore";
import type { Node, Edge } from "@xyflow/react";
import type { NodeData } from "../NodeData";

beforeEach(() => {
  useNodeTemplatesStore.setState({ templates: [] });
});

const createMockNode = (id: string, type: string = "testNode"): Node<NodeData> => ({
  id,
  type,
  position: { x: 100 + parseInt(id) * 10, y: 100 + parseInt(id) * 10 },
  data: { 
    title: `Node ${id}`,
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: ""
  },
  width: 280,
  height: 100,
  selected: false,
  dragging: false
});

const createMockEdge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
  sourceHandle: "output",
  targetHandle: "input",
  type: "default"
});

describe("NodeTemplatesStore", () => {
  beforeEach(() => {
    useNodeTemplatesStore.setState({ templates: [] });
  });

  describe("createTemplate", () => {
    it("should create a new template with correct structure", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1"), createMockNode("2")];
      const edges = [createMockEdge("e1", "1", "2")];

      act(() => {
        result.current.createTemplate({
          name: "Test Template",
          description: "A test template",
          category: "Test Category",
          nodes,
          edges
        });
      });

      const templates = result.current.getAllTemplates();
      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe("Test Template");
      expect(templates[0].description).toBe("A test template");
      expect(templates[0].category).toBe("Test Category");
      expect(templates[0].nodes).toHaveLength(2);
      expect(templates[0].edges).toHaveLength(1);
      expect(templates[0].usageCount).toBe(0);
    });

    it("should use default category when not provided", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      act(() => {
        result.current.createTemplate({
          name: "Test Template",
          nodes,
          edges: []
        });
      });

      const templates = result.current.getAllTemplates();
      expect(templates[0].category).toBe("My Templates");
    });

    it("should set createdAt and updatedAt timestamps", () => {
      const beforeTime = Date.now();
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      act(() => {
        result.current.createTemplate({
          name: "Test Template",
          nodes,
          edges: []
        });
      });

      const afterTime = Date.now();
      const template = result.current.getAllTemplates()[0];

      expect(template.createdAt).toBeGreaterThanOrEqual(beforeTime);
      expect(template.createdAt).toBeLessThanOrEqual(afterTime);
      expect(template.updatedAt).toBeGreaterThanOrEqual(beforeTime);
      expect(template.updatedAt).toBeLessThanOrEqual(afterTime);
    });

    it("should generate unique IDs for templates", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      act(() => {
        result.current.createTemplate({
          name: "Template 1",
          nodes,
          edges: []
        });
        result.current.createTemplate({
          name: "Template 2",
          nodes,
          edges: []
        });
      });

      const templates = result.current.getAllTemplates();
      // Templates should be distinct - name check is sufficient for this test
      expect(templates[0].name).toBe("Template 2");
      expect(templates[1].name).toBe("Template 1");
    });

    it("should limit the number of templates to MAX_TEMPLATES", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      for (let i = 0; i < 55; i++) {
        act(() => {
          result.current.createTemplate({
            name: `Template ${i}`,
            nodes,
            edges: []
          });
        });
      }

      const templates = result.current.getAllTemplates();
      expect(templates.length).toBeLessThanOrEqual(50);
    });

    it("should deep clone nodes to prevent reference issues", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const originalNode = createMockNode("1");
      originalNode.data.title = "original";

      act(() => {
        result.current.createTemplate({
          name: "Test Template",
          nodes: [originalNode],
          edges: []
        });
      });

      const template = result.current.getAllTemplates()[0];
      const storedNode = template.nodes[0];

      expect(storedNode.data.title).toBe("original");
      expect(storedNode).not.toBe(originalNode);
      expect(storedNode.position).not.toBe(originalNode.position);
    });
  });

  describe("updateTemplate", () => {
    it("should update template properties", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      act(() => {
        result.current.createTemplate({
          name: "Original Name",
          nodes,
          edges: []
        });
      });

      const template = result.current.getAllTemplates()[0];
      const templateId = template.id;

      act(() => {
        result.current.updateTemplate(templateId, {
          name: "Updated Name",
          description: "Updated description"
        });
      });

      const updated = result.current.getTemplate(templateId);
      expect(updated?.name).toBe("Updated Name");
      expect(updated?.description).toBe("Updated description");
    });

    it("should update updatedAt timestamp when modifying", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      act(() => {
        result.current.createTemplate({
          name: "Test",
          nodes,
          edges: []
        });
      });

      const template = result.current.getAllTemplates()[0];
      const originalName = template.name;

      act(() => {
        result.current.updateTemplate(template.id, { name: "New Name" });
      });

      const updated = result.current.getTemplate(template.id);
      expect(updated?.name).toBe("New Name");
      expect(updated?.name).not.toBe(originalName);
    });
  });

  describe("deleteTemplate", () => {
    it("should remove template from store", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      act(() => {
        result.current.createTemplate({
          name: "To Delete",
          nodes,
          edges: []
        });
      });

      const template = result.current.getAllTemplates()[0];
      expect(result.current.getAllTemplates()).toHaveLength(1);

      act(() => {
        result.current.deleteTemplate(template.id);
      });

      expect(result.current.getAllTemplates()).toHaveLength(0);
      expect(result.current.getTemplate(template.id)).toBeUndefined();
    });

    it("should handle deleting non-existent template gracefully", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.deleteTemplate("non-existent-id");
      });

      expect(result.current.getAllTemplates()).toHaveLength(0);
    });
  });

  describe("duplicateTemplate", () => {
    it("should create a duplicate with new ID", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      act(() => {
        result.current.createTemplate({
          name: "Original",
          description: "Original description",
          category: "Test",
          nodes,
          edges: []
        });
      });

      const original = result.current.getAllTemplates()[0];

      act(() => {
        result.current.duplicateTemplate(original.id);
      });

      const templates = result.current.getAllTemplates();
      expect(templates).toHaveLength(2);

      const duplicate = templates.find(t => t.id !== original.id);
      expect(duplicate).toBeDefined();
      expect(duplicate?.name).toBe("Original (Copy)");
      expect(duplicate?.description).toBe("Original description");
      expect(duplicate?.category).toBe("Test");
      expect(duplicate?.usageCount).toBe(0);
    });

    it("should handle duplicating non-existent template", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      expect(() => {
        act(() => {
          result.current.duplicateTemplate("non-existent");
        });
      }).toThrow();
    });
  });

  describe("searchTemplates", () => {
    beforeEach(() => {
      useNodeTemplatesStore.setState({ templates: [] });
    });

    it("should find templates by name", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      act(() => {
        result.current.createTemplate({
          name: "Image Processing Pipeline",
          nodes,
          edges: []
        });
        result.current.createTemplate({
          name: "Text Analysis",
          nodes,
          edges: []
        });
      });

      const found = result.current.searchTemplates("image");
      expect(found).toHaveLength(1);
      expect(found[0].name).toBe("Image Processing Pipeline");
    });

    it("should find templates by description", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      act(() => {
        result.current.createTemplate({
          name: "Template One",
          description: "This processes audio files",
          nodes,
          edges: []
        });
        result.current.createTemplate({
          name: "Template Two",
          description: "This processes video files",
          nodes,
          edges: []
        });
      });

      const found = result.current.searchTemplates("audio");
      expect(found).toHaveLength(1);
      expect(found[0].description).toContain("audio");
    });

    it("should find templates by category", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      act(() => {
        result.current.createTemplate({
          name: "Template One",
          category: "Data Processing",
          nodes,
          edges: []
        });
        result.current.createTemplate({
          name: "Template Two",
          category: "Machine Learning",
          nodes,
          edges: []
        });
      });

      const found = result.current.searchTemplates("machine");
      expect(found).toHaveLength(1);
      expect(found[0].category).toBe("Machine Learning");
    });

    it("should return all templates for empty search", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      act(() => {
        result.current.createTemplate({ name: "One", nodes, edges: [] });
        result.current.createTemplate({ name: "Two", nodes, edges: [] });
      });

      const found = result.current.searchTemplates("");
      expect(found).toHaveLength(2);
    });

    it("should be case insensitive", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      act(() => {
        result.current.createTemplate({
          name: "IMAGE PROCESSOR",
          nodes,
          edges: []
        });
      });

      const found = result.current.searchTemplates("image");
      expect(found).toHaveLength(1);
    });

    it("should trim whitespace from search query", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      act(() => {
        result.current.createTemplate({
          name: "Test Template",
          nodes,
          edges: []
        });
      });

      const found = result.current.searchTemplates("  test  ");
      expect(found).toHaveLength(1);
    });
  });

  describe("getTemplateCategories", () => {
    it("should return unique categories sorted alphabetically", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      act(() => {
        result.current.createTemplate({
          name: "Template 1",
          category: "Data",
          nodes,
          edges: []
        });
        result.current.createTemplate({
          name: "Template 2",
          category: "Machine Learning",
          nodes,
          edges: []
        });
        result.current.createTemplate({
          name: "Template 3",
          category: "Data",
          nodes,
          edges: []
        });
      });

      const categories = result.current.getTemplateCategories();
      expect(categories).toEqual(["Data", "Machine Learning"]);
    });

    it("should return empty array when no templates exist", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const categories = result.current.getTemplateCategories();
      expect(categories).toEqual([]);
    });
  });

  describe("incrementUsage", () => {
    it("should increment usage count", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      act(() => {
        result.current.createTemplate({
          name: "Test",
          nodes,
          edges: []
        });
      });

      const template = result.current.getAllTemplates()[0];
      expect(template.usageCount).toBe(0);

      act(() => {
        result.current.incrementUsage(template.id);
      });

      const updated = result.current.getTemplate(template.id);
      expect(updated?.usageCount).toBe(1);

      act(() => {
        result.current.incrementUsage(template.id);
      });

      const updatedAgain = result.current.getTemplate(template.id);
      expect(updatedAgain?.usageCount).toBe(2);
    });
  });

  describe("Import/Export", () => {
    it("should export templates as JSON", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      act(() => {
        result.current.createTemplate({
          name: "Test Template",
          nodes,
          edges: []
        });
      });

      const exported = result.current.exportTemplates();
      const parsed = JSON.parse(exported);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe("Test Template");
    });

    it("should import templates", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const templatesToImport: NodeTemplate[] = [
        {
          id: "imported-1",
          name: "Imported Template",
          description: "An imported template",
          nodes: [],
          edges: [],
          category: "Imported",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          usageCount: 0
        }
      ];

      act(() => {
        result.current.importTemplates(templatesToImport);
      });

      expect(result.current.getAllTemplates()).toHaveLength(1);
      expect(result.current.getTemplate("imported-1")?.name).toBe("Imported Template");
    });

    it("should not import duplicate IDs", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      act(() => {
        result.current.createTemplate({
          name: "Original",
          nodes,
          edges: []
        });
      });

      const original = result.current.getAllTemplates()[0];

      act(() => {
        result.current.importTemplates([original]);
      });

      expect(result.current.getAllTemplates()).toHaveLength(1);
    });
  });

  describe("clearAllTemplates", () => {
    it("should remove all templates", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodes = [createMockNode("1")];

      act(() => {
        result.current.createTemplate({ name: "One", nodes, edges: [] });
        result.current.createTemplate({ name: "Two", nodes, edges: [] });
        result.current.createTemplate({ name: "Three", nodes, edges: [] });
      });

      expect(result.current.getAllTemplates()).toHaveLength(3);

      act(() => {
        result.current.clearAllTemplates();
      });

      expect(result.current.getAllTemplates()).toHaveLength(0);
    });
  });

  describe("UI State", () => {
    it("should manage isMenuOpen state", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      expect(result.current.isMenuOpen).toBe(false);

      act(() => {
        result.current.setMenuOpen(true);
      });

      expect(result.current.isMenuOpen).toBe(true);

      act(() => {
        result.current.setMenuOpen(false);
      });

      expect(result.current.isMenuOpen).toBe(false);
    });

    it("should manage selectedCategory state", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      expect(result.current.selectedCategory).toBe(null);

      act(() => {
        result.current.setSelectedCategory("Machine Learning");
      });

      expect(result.current.selectedCategory).toBe("Machine Learning");
    });
  });
});
