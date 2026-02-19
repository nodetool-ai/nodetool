/**
 * useNodeTemplates hook tests
 *
 * Note: This hook requires NodeContext for full functionality.
 * These tests only cover the store-based operations that don't require the context.
 */

import { renderHook, act } from "@testing-library/react";
import { useNodeTemplatesStore } from "../../stores/NodeTemplatesStore";
import type { NodeData } from "../../stores/NodeData";

describe("useNodeTemplates (integration with store)", () => {
  beforeEach(() => {
    // Reset store state before each test
    useNodeTemplatesStore.setState({ templates: [] });
  });

  describe("store operations via hook interface", () => {
    it("should create and retrieve templates via store", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.addTemplate({
          name: "Test Template",
          description: "A test template",
          category: "common",
          nodes: [
            {
              id: "node-1",
              type: "default",
              position: { x: 0, y: 0 },
              data: {
                properties: {},
                selectable: true,
                dynamic_properties: {},
                workflow_id: "test"
              } as NodeData
            }
          ],
          edges: []
        });
      });

      expect(result.current.templates).toHaveLength(1);
      expect(result.current.templates[0].name).toBe("Test Template");
    });

    it("should update template metadata", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      let templateId: string;

      act(() => {
        templateId = result.current.addTemplate({
          name: "Original Name",
          description: "Original Description",
          category: "common",
          nodes: [
            {
              id: "node-1",
              type: "default",
              position: { x: 0, y: 0 },
              data: {
                properties: {},
                selectable: true,
                dynamic_properties: {},
                workflow_id: "test"
              } as NodeData
            }
          ],
          edges: []
        });
      });

      act(() => {
        result.current.updateTemplate(templateId, {
          name: "Updated Name",
          category: "image-processing"
        });
      });

      const template = result.current.templates[0];
      expect(template.name).toBe("Updated Name");
      expect(template.category).toBe("image-processing");
    });

    it("should delete a template by ID", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      let templateId: string;

      act(() => {
        templateId = result.current.addTemplate({
          name: "To Delete",
          description: "This will be deleted",
          category: "common",
          nodes: [
            {
              id: "node-1",
              type: "default",
              position: { x: 0, y: 0 },
              data: {
                properties: {},
                selectable: true,
                dynamic_properties: {},
                workflow_id: "test"
              } as NodeData
            }
          ],
          edges: []
        });
      });

      expect(result.current.templates).toHaveLength(1);

      act(() => {
        result.current.deleteTemplate(templateId);
      });

      expect(result.current.templates).toHaveLength(0);
    });

    it("should export and import templates correctly", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      let templateId: string;

      act(() => {
        templateId = result.current.addTemplate({
          name: "Export Test",
          description: "Testing export/import",
          category: "common",
          nodes: [
            {
              id: "node-1",
              type: "default",
              position: { x: 0, y: 0 },
              data: {
                properties: {},
                selectable: true,
                dynamic_properties: {},
                workflow_id: "test"
              } as NodeData
            }
          ],
          edges: []
        });
      });

      // Export
      const json = result.current.exportTemplate(templateId);
      expect(json).toBeDefined();
      expect(typeof json).toBe("string");

      // Clear templates
      act(() => {
        result.current.clearTemplates();
      });
      expect(result.current.templates).toHaveLength(0);

      // Import
      act(() => {
        const imported = result.current.importTemplate(json!);
        expect(imported).not.toBeNull();
      });

      expect(result.current.templates).toHaveLength(1);
      const importedTemplate = result.current.templates[0];
      expect(importedTemplate.name).toBe("Export Test");
      // ID should be different (new ID generated on import)
      expect(importedTemplate.id).not.toBe(templateId);
    });

    it("should return undefined when exporting non-existent template", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const json = result.current.exportTemplate("non-existent");
      expect(json).toBeUndefined();
    });

    it("should return null when importing invalid JSON", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        const imported = result.current.importTemplate("invalid json");
        expect(imported).toBeNull();
      });

      expect(result.current.templates).toHaveLength(0);
    });

    it("should retrieve a template by ID", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      let templateId: string;

      act(() => {
        templateId = result.current.addTemplate({
          name: "Test Template",
          description: "Test",
          category: "common",
          nodes: [
            {
              id: "node-1",
              type: "default",
              position: { x: 0, y: 0 },
              data: {
                properties: {},
                selectable: true,
                dynamic_properties: {},
                workflow_id: "test"
              } as NodeData
            }
          ],
          edges: []
        });
      });

      const template = result.current.getTemplate(templateId);
      expect(template).toBeDefined();
      expect(template?.name).toBe("Test Template");
    });

    it("should return undefined for non-existent template", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const template = result.current.getTemplate("non-existent");
      expect(template).toBeUndefined();
    });

    it("should get templates by category", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.addTemplate({
          name: "Common Template",
          description: "Test",
          category: "common",
          nodes: [
            {
              id: "node-1",
              type: "default",
              position: { x: 0, y: 0 },
              data: {
                properties: {},
                selectable: true,
                dynamic_properties: {},
                workflow_id: "test"
              } as NodeData
            }
          ],
          edges: []
        });
        result.current.addTemplate({
          name: "Image Template",
          description: "Test",
          category: "image-processing",
          nodes: [
            {
              id: "node-2",
              type: "default",
              position: { x: 0, y: 0 },
              data: {
                properties: {},
                selectable: true,
                dynamic_properties: {},
                workflow_id: "test"
              } as NodeData
            }
          ],
          edges: []
        });
      });

      const commonTemplates = result.current.getTemplatesByCategory("common");
      expect(commonTemplates).toHaveLength(1);

      const imageTemplates = result.current.getTemplatesByCategory("image-processing");
      expect(imageTemplates).toHaveLength(1);
    });

    it("should enforce maximum template limit", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const templateNode = {
        id: "node-1",
        type: "default" as const,
        position: { x: 0, y: 0 },
        data: {
          properties: {},
          selectable: true,
          dynamic_properties: {},
          workflow_id: "test"
        } as NodeData
      };

      // Add more than MAX_TEMPLATES (50)
      for (let i = 0; i < 55; i++) {
        act(() => {
          result.current.addTemplate({
            name: `Template ${i}`,
            description: `Description ${i}`,
            category: "common",
            nodes: [templateNode],
            edges: []
          });
        });
      }

      expect(result.current.templates).toHaveLength(50);
      // Most recent should be first
      expect(result.current.templates[0].name).toBe("Template 54");
    });

    it("should reorder templates", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.addTemplate({
          name: "Template 1",
          description: "Test",
          category: "common",
          nodes: [
            {
              id: "node-1",
              type: "default",
              position: { x: 0, y: 0 },
              data: {
                properties: {},
                selectable: true,
                dynamic_properties: {},
                workflow_id: "test"
              } as NodeData
            }
          ],
          edges: []
        });
        result.current.addTemplate({
          name: "Template 2",
          description: "Test",
          category: "common",
          nodes: [
            {
              id: "node-2",
              type: "default",
              position: { x: 0, y: 0 },
              data: {
                properties: {},
                selectable: true,
                dynamic_properties: {},
                workflow_id: "test"
              } as NodeData
            }
          ],
          edges: []
        });
        result.current.addTemplate({
          name: "Template 3",
          description: "Test",
          category: "common",
          nodes: [
            {
              id: "node-3",
              type: "default",
              position: { x: 0, y: 0 },
              data: {
                properties: {},
                selectable: true,
                dynamic_properties: {},
                workflow_id: "test"
              } as NodeData
            }
          ],
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
  });
});
