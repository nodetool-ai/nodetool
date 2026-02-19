/**
 * NodeTemplatesStore tests
 */

import { renderHook, act } from "@testing-library/react";
import { useNodeTemplatesStore } from "../NodeTemplatesStore";
import type { TemplateNode, TemplateEdge } from "../NodeTemplatesStore";
import type { NodeData } from "../NodeData";

const mockTemplateNode: TemplateNode = {
  id: "node-1",
  type: "default",
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    selectable: true,
    dynamic_properties: {},
    workflow_id: "test-workflow"
  } as NodeData
};

const mockTemplateEdge: TemplateEdge = {
  id: "edge-1",
  source: "node-1",
  target: "node-2"
};

describe("NodeTemplatesStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useNodeTemplatesStore.setState({ templates: [] });
  });

  describe("addTemplate", () => {
    it("should add a new template with generated ID and timestamps", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.addTemplate({
          name: "Test Template",
          description: "A test template",
          category: "common",
          nodes: [mockTemplateNode],
          edges: [mockTemplateEdge]
        });
      });

      const templates = result.current.templates;
      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe("Test Template");
      expect(templates[0].description).toBe("A test template");
      expect(templates[0].category).toBe("common");
      expect(templates[0].id).toMatch(/^template-\d+-[a-z0-9]+$/);
      expect(templates[0].createdAt).toBeGreaterThan(0);
      expect(templates[0].updatedAt).toBeGreaterThan(0);
    });

    it("should add new templates to the front of the array", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.addTemplate({
          name: "First Template",
          description: "First",
          category: "common",
          nodes: [mockTemplateNode],
          edges: []
        });
      });

      act(() => {
        result.current.addTemplate({
          name: "Second Template",
          description: "Second",
          category: "common",
          nodes: [mockTemplateNode],
          edges: []
        });
      });

      const templates = result.current.templates;
      expect(templates).toHaveLength(2);
      expect(templates[0].name).toBe("Second Template");
      expect(templates[1].name).toBe("First Template");
    });

    it("should enforce maximum template limit", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      // Add more than MAX_TEMPLATES (50)
      for (let i = 0; i < 55; i++) {
        act(() => {
          result.current.addTemplate({
            name: `Template ${i}`,
            description: `Description ${i}`,
            category: "common",
            nodes: [mockTemplateNode],
            edges: []
          });
        });
      }

      expect(result.current.templates).toHaveLength(50);
      // Most recent should be first
      expect(result.current.templates[0].name).toBe("Template 54");
    });
  });

  describe("updateTemplate", () => {
    it("should update template fields and updatedAt timestamp", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      let templateId = "";

      act(() => {
        templateId = result.current.addTemplate({
          name: "Original Name",
          description: "Original Description",
          category: "common",
          nodes: [mockTemplateNode],
          edges: []
        });
      });

      const originalUpdatedAt = result.current.templates[0].updatedAt;

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 2));

      act(() => {
        result.current.updateTemplate(templateId, {
          name: "Updated Name",
          category: "image-processing"
        });
      });

      const template = result.current.templates[0];
      expect(template.name).toBe("Updated Name");
      expect(template.description).toBe("Original Description"); // Unchanged
      expect(template.category).toBe("image-processing");
      expect(template.updatedAt).toBeGreaterThan(originalUpdatedAt);
    });
  });

  describe("deleteTemplate", () => {
    it("should remove template by ID", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      let id1 = "";
      let id2 = "";

      act(() => {
        id1 = result.current.addTemplate({
          name: "Template 1",
          description: "First",
          category: "common",
          nodes: [mockTemplateNode],
          edges: []
        });
        id2 = result.current.addTemplate({
          name: "Template 2",
          description: "Second",
          category: "common",
          nodes: [mockTemplateNode],
          edges: []
        });
      });

      expect(result.current.templates).toHaveLength(2);

      act(() => {
        result.current.deleteTemplate(id1);
      });

      expect(result.current.templates).toHaveLength(1);
      expect(result.current.templates[0].id).toBe(id2);
    });

    it("should do nothing if template ID does not exist", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.addTemplate({
          name: "Test Template",
          description: "Test",
          category: "common",
          nodes: [mockTemplateNode],
          edges: []
        });
      });

      const originalLength = result.current.templates.length;

      act(() => {
        result.current.deleteTemplate("non-existent-id");
      });

      expect(result.current.templates).toHaveLength(originalLength);
    });
  });

  describe("getTemplate", () => {
    it("should return template by ID", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      let templateId = "";

      act(() => {
        templateId = result.current.addTemplate({
          name: "Test Template",
          description: "Test",
          category: "common",
          nodes: [mockTemplateNode],
          edges: []
        });
      });

      const template = result.current.getTemplate(templateId);
      expect(template).toBeDefined();
      expect(template?.name).toBe("Test Template");
    });

    it("should return undefined for non-existent ID", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const template = result.current.getTemplate("non-existent");
      expect(template).toBeUndefined();
    });
  });

  describe("getTemplatesByCategory", () => {
    it("should return templates filtered by category", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.addTemplate({
          name: "Common Template",
          description: "Test",
          category: "common",
          nodes: [mockTemplateNode],
          edges: []
        });
        result.current.addTemplate({
          name: "Image Template",
          description: "Test",
          category: "image-processing",
          nodes: [mockTemplateNode],
          edges: []
        });
        result.current.addTemplate({
          name: "Another Common Template",
          description: "Test",
          category: "common",
          nodes: [mockTemplateNode],
          edges: []
        });
      });

      const commonTemplates = result.current.getTemplatesByCategory("common");
      expect(commonTemplates).toHaveLength(2);

      const imageTemplates = result.current.getTemplatesByCategory("image-processing");
      expect(imageTemplates).toHaveLength(1);
    });
  });

  describe("clearTemplates", () => {
    it("should remove all templates", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.addTemplate({
          name: "Template 1",
          description: "Test",
          category: "common",
          nodes: [mockTemplateNode],
          edges: []
        });
        result.current.addTemplate({
          name: "Template 2",
          description: "Test",
          category: "common",
          nodes: [mockTemplateNode],
          edges: []
        });
      });

      expect(result.current.templates).toHaveLength(2);

      act(() => {
        result.current.clearTemplates();
      });

      expect(result.current.templates).toHaveLength(0);
    });
  });

  describe("exportTemplate", () => {
    it("should export template as JSON string", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      let templateId = "";

      act(() => {
        templateId = result.current.addTemplate({
          name: "Export Template",
          description: "For testing export",
          category: "common",
          nodes: [mockTemplateNode],
          edges: []
        });
      });

      const json = result.current.exportTemplate(templateId);
      expect(json).toBeDefined();

      const parsed = JSON.parse(json!);
      expect(parsed.name).toBe("Export Template");
      expect(parsed.description).toBe("For testing export");
    });

    it("should return undefined for non-existent template", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const json = result.current.exportTemplate("non-existent");
      expect(json).toBeUndefined();
    });
  });

  describe("importTemplate", () => {
    it("should import template from valid JSON", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const templateJson = JSON.stringify({
        id: "original-id",
        name: "Imported Template",
        description: "Imported from JSON",
        category: "custom",
        nodes: [mockTemplateNode],
        edges: [],
        createdAt: 1234567890,
        updatedAt: 1234567890
      });

      act(() => {
        const imported = result.current.importTemplate(templateJson);
        expect(imported).not.toBeNull();
      });

      const templates = result.current.templates;
      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe("Imported Template");
      expect(templates[0].id).not.toBe("original-id"); // Should generate new ID
      expect(templates[0].createdAt).not.toBe(1234567890); // Should generate new timestamp
    });

    it("should return null for invalid JSON", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        const imported = result.current.importTemplate("invalid json");
        expect(imported).toBeNull();
      });

      expect(result.current.templates).toHaveLength(0);
    });

    it("should return null for invalid template structure", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const invalidJson = JSON.stringify({
        name: "Incomplete Template"
        // Missing required fields
      });

      act(() => {
        const imported = result.current.importTemplate(invalidJson);
        expect(imported).toBeNull();
      });

      expect(result.current.templates).toHaveLength(0);
    });
  });

  describe("reorderTemplates", () => {
    it("should reorder templates by index", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.addTemplate({
          name: "Template 1",
          description: "Test",
          category: "common",
          nodes: [mockTemplateNode],
          edges: []
        });
        result.current.addTemplate({
          name: "Template 2",
          description: "Test",
          category: "common",
          nodes: [mockTemplateNode],
          edges: []
        });
        result.current.addTemplate({
          name: "Template 3",
          description: "Test",
          category: "common",
          nodes: [mockTemplateNode],
          edges: []
        });
      });

      expect(result.current.templates[0].name).toBe("Template 3");
      expect(result.current.templates[1].name).toBe("Template 2");
      expect(result.current.templates[2].name).toBe("Template 1");

      act(() => {
        result.current.reorderTemplates(0, 2);
      });

      expect(result.current.templates[0].name).toBe("Template 2");
      expect(result.current.templates[1].name).toBe("Template 1");
      expect(result.current.templates[2].name).toBe("Template 3");
    });

    it("should handle invalid indices gracefully", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.addTemplate({
          name: "Template 1",
          description: "Test",
          category: "common",
          nodes: [mockTemplateNode],
          edges: []
        });
      });

      const originalTemplates = result.current.templates;

      act(() => {
        result.current.reorderTemplates(-1, 0);
      });

      expect(result.current.templates).toEqual(originalTemplates);

      act(() => {
        result.current.reorderTemplates(0, 100);
      });

      expect(result.current.templates).toEqual(originalTemplates);
    });
  });

  describe("getAllTemplates", () => {
    it("should return all templates", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.addTemplate({
          name: "Template 1",
          description: "Test",
          category: "common",
          nodes: [mockTemplateNode],
          edges: []
        });
        result.current.addTemplate({
          name: "Template 2",
          description: "Test",
          category: "image-processing",
          nodes: [mockTemplateNode],
          edges: []
        });
      });

      const allTemplates = result.current.getAllTemplates();
      expect(allTemplates).toHaveLength(2);
    });
  });
});
