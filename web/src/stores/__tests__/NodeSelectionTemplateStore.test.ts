import { renderHook, act } from "@testing-library/react";
import { useNodeSelectionTemplateStore, NodeTemplate } from "../NodeSelectionTemplateStore";

describe("NodeSelectionTemplateStore", () => {
  beforeEach(() => {
    useNodeSelectionTemplateStore.setState({
      templates: {},
      categories: [
        { id: "custom", name: "Custom", icon: "Star" },
        { id: "input", name: "Input/Output", icon: "Input" },
        { id: "processing", name: "Processing", icon: "Process" }
      ],
      selectedTemplateId: null,
      isTemplateBrowserOpen: false,
      isSaveDialogOpen: false,
      searchQuery: ""
    });
  });

  describe("Template CRUD Operations", () => {
    test("should create a template", () => {
      const { result } = renderHook(() => useNodeSelectionTemplateStore());

      const mockNodes = [
        { id: "node1", type: "text", position: { x: 0, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "" } },
        { id: "node2", type: "image", position: { x: 100, y: 100 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "" } }
      ] as any;

      const mockEdges = [
        { id: "edge1", source: "node1", target: "node2", sourceHandle: "output", targetHandle: "input" }
      ] as any;

      act(() => {
        const id = result.current.createTemplate(
          "Text to Image",
          "Converts text to image using AI",
          "processing",
          ["ai", "text", "image"],
          mockNodes,
          mockEdges
        );
        expect(id).toBeDefined();
        expect(typeof id).toBe("string");
      });

      const template = result.current.getTemplate(result.current.getAllTemplates()[0]?.id || "");
      expect(template).toBeDefined();
      expect(template?.name).toBe("Text to Image");
      expect(template?.description).toBe("Converts text to image using AI");
      expect(template?.category).toBe("processing");
      expect(template?.tags).toEqual(["ai", "text", "image"]);
      expect(template?.nodes).toHaveLength(2);
      expect(template?.edges).toHaveLength(1);
    });

    test("should update a template", () => {
      const { result } = renderHook(() => useNodeSelectionTemplateStore());

      const mockNodes = [
        { id: "node1", type: "text", position: { x: 0, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "" } }
      ] as any;

      act(() => {
        const id = result.current.createTemplate(
          "Original Name",
          "Original description",
          "custom",
          ["tag1"],
          mockNodes,
          []
        );

        result.current.updateTemplate(id, {
          name: "Updated Name",
          description: "Updated description",
          tags: ["tag1", "tag2"]
        });
      });

      const template = result.current.getAllTemplates()[0];
      expect(template?.name).toBe("Updated Name");
      expect(template?.description).toBe("Updated description");
      expect(template?.tags).toEqual(["tag1", "tag2"]);
    });

    test("should delete a template", () => {
      const { result } = renderHook(() => useNodeSelectionTemplateStore());

      const mockNodes = [{ id: "node1", type: "text", position: { x: 0, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "" } }] as any;

      act(() => {
        const id = result.current.createTemplate("Template to Delete", "Description", "custom", [], mockNodes, []);
        expect(result.current.getAllTemplates()).toHaveLength(1);

        result.current.deleteTemplate(id);
      });

      expect(result.current.getAllTemplates()).toHaveLength(0);
    });

    test("should duplicate a template", () => {
      const { result } = renderHook(() => useNodeSelectionTemplateStore());

      const mockNodes = [{ id: "node1", type: "text", position: { x: 0, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "" } }] as any;

      act(() => {
        const id = result.current.createTemplate("Original", "Description", "custom", [], mockNodes, []);
        expect(result.current.getAllTemplates()).toHaveLength(1);

        const newId = result.current.duplicateTemplate(id);
        expect(newId).not.toBe(id);
        expect(result.current.getAllTemplates()).toHaveLength(2);

        const duplicated = result.current.getTemplate(newId!);
        expect(duplicated?.name).toBe("Original (Copy)");
      });
    });
  });

  describe("Template Search and Filtering", () => {
    beforeEach(() => {
      const mockNodes = [{ id: "node1", type: "text", position: { x: 0, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "" } }] as any;

      act(() => {
        result.current.createTemplate("Text to Image", "AI image generation", "processing", ["ai", "image"], mockNodes, []);
        result.current.createTemplate("Image Resizer", "Resize images", "processing", ["image", "resize"], mockNodes, []);
        result.current.createTemplate("Audio Transcriber", "Convert audio to text", "input", ["audio", "transcribe"], mockNodes, []);
      });
    });

    const { result } = renderHook(() => useNodeSelectionTemplateStore());

    test("should search templates by name", () => {
      const results = result.current.searchTemplates("image");
      expect(results).toHaveLength(2);
      expect(results.find(t => t.name === "Text to Image")).toBeDefined();
      expect(results.find(t => t.name === "Image Resizer")).toBeDefined();
    });

    test("should search templates by tag", () => {
      const results = result.current.searchTemplates("audio");
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Audio Transcriber");
    });

    test("should return all templates for empty search", () => {
      const results = result.current.searchTemplates("");
      expect(results).toHaveLength(3);
    });

    test("should filter templates by category", () => {
      const processingTemplates = result.current.getTemplatesByCategory("processing");
      expect(processingTemplates).toHaveLength(2);

      const inputTemplates = result.current.getTemplatesByCategory("input");
      expect(inputTemplates).toHaveLength(1);
    });
  });

  describe("Usage Tracking", () => {
    test("should increment usage count", () => {
      const { result } = renderHook(() => useNodeSelectionTemplateStore());

      const mockNodes = [{ id: "node1", type: "text", position: { x: 0, y: 0 }, data: { properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "" } }] as any;

      act(() => {
        const id = result.current.createTemplate("Popular Template", "Description", "custom", [], mockNodes, []);
        expect(result.current.getTemplate(id)?.usageCount).toBe(0);

        result.current.incrementUsageCount(id);
        expect(result.current.getTemplate(id)?.usageCount).toBe(1);

        result.current.incrementUsageCount(id);
        result.current.incrementUsageCount(id);
        expect(result.current.getTemplate(id)?.usageCount).toBe(3);
      });
    });
  });

  describe("UI State Management", () => {
    test("should manage selected template", () => {
      const { result } = renderHook(() => useNodeSelectionTemplateStore());

      act(() => {
        result.current.setSelectedTemplateId("template1");
      });
      expect(result.current.selectedTemplateId).toBe("template1");

      act(() => {
        result.current.setSelectedTemplateId(null);
      });
      expect(result.current.selectedTemplateId).toBeNull();
    });

    test("should manage template browser open state", () => {
      const { result } = renderHook(() => useNodeSelectionTemplateStore());

      act(() => {
        result.current.setTemplateBrowserOpen(true);
      });
      expect(result.current.isTemplateBrowserOpen).toBe(true);

      act(() => {
        result.current.setTemplateBrowserOpen(false);
      });
      expect(result.current.isTemplateBrowserOpen).toBe(false);
    });

    test("should manage save dialog open state", () => {
      const { result } = renderHook(() => useNodeSelectionTemplateStore());

      act(() => {
        result.current.setSaveDialogOpen(true);
      });
      expect(result.current.isSaveDialogOpen).toBe(true);

      act(() => {
        result.current.setSaveDialogOpen(false);
      });
      expect(result.current.isSaveDialogOpen).toBe(false);
    });

    test("should manage search query", () => {
      const { result } = renderHook(() => useNodeSelectionTemplateStore());

      act(() => {
        result.current.setSearchQuery("test query");
      });
      expect(result.current.searchQuery).toBe("test query");
    });
  });

  describe("Categories", () => {
    test("should add a new category", () => {
      const { result } = renderHook(() => useNodeSelectionTemplateStore());

      let newId: string | undefined;
      act(() => {
        newId = result.current.addCategory("New Category", "Star");
        expect(newId).toBeDefined();
      });

      const addedCategory = result.current.categories.find(c => c.id === newId);
      expect(addedCategory).toBeDefined();
      expect(addedCategory?.name).toBe("New Category");
    });

    test("should delete a category", () => {
      const { result } = renderHook(() => useNodeSelectionTemplateStore());

      const initialCount = result.current.categories.length;

      act(() => {
        result.current.deleteCategory("custom");
      });

      expect(result.current.categories).toHaveLength(initialCount - 1);
      expect(result.current.categories.find(c => c.id === "custom")).toBeUndefined();
    });
  });

  describe("clearState", () => {
    test("should clear all state", () => {
      const { result } = renderHook(() => useNodeSelectionTemplateStore());

      act(() => {
        result.current.setSelectedTemplateId("template1");
        result.current.setTemplateBrowserOpen(true);
        result.current.setSaveDialogOpen(true);
        result.current.setSearchQuery("test");
      });

      expect(result.current.selectedTemplateId).toBe("template1");
      expect(result.current.isTemplateBrowserOpen).toBe(true);
      expect(result.current.isSaveDialogOpen).toBe(true);
      expect(result.current.searchQuery).toBe("test");

      act(() => {
        result.current.clearState();
      });

      expect(result.current.selectedTemplateId).toBeNull();
      expect(result.current.isTemplateBrowserOpen).toBe(false);
      expect(result.current.isSaveDialogOpen).toBe(false);
      expect(result.current.searchQuery).toBe("");
    });
  });
});
