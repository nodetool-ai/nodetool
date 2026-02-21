/**
 * Tests for NodeTemplatesStore
 */

import { renderHook, act } from "@testing-library/react";
import { useNodeTemplatesStore, BUILT_IN_TEMPLATES, TemplateCategory } from "../NodeTemplatesStore";

describe("NodeTemplatesStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useNodeTemplatesStore.setState({
      isOpen: false,
      selectedCategory: "All",
      searchTerm: "",
      selectedIndex: 0,
      templates: BUILT_IN_TEMPLATES,
      filteredTemplates: BUILT_IN_TEMPLATES,
      insertPosition: { x: 100, y: 100 }
    });
  });

  describe("initial state", () => {
    it("should have correct initial state", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      expect(result.current.isOpen).toBe(false);
      expect(result.current.selectedCategory).toBe("All");
      expect(result.current.searchTerm).toBe("");
      expect(result.current.selectedIndex).toBe(0);
      expect(result.current.templates).toEqual(BUILT_IN_TEMPLATES);
      expect(result.current.filteredTemplates).toEqual(BUILT_IN_TEMPLATES);
      expect(result.current.insertPosition).toEqual({ x: 100, y: 100 });
    });

    it("should have all built-in templates", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      expect(result.current.templates.length).toBeGreaterThan(0);
      expect(result.current.templates).toContainEqual({
        id: "text-to-text",
        name: "Text to Text",
        description: "Generate text from text using an LLM",
        category: "Text",
        nodes: expect.any(Array),
        connections: expect.any(Array)
      });
    });
  });

  describe("openDialog", () => {
    it("should open the dialog and reset filters", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      // Set some filter state first
      act(() => {
        result.current.setSearchTerm("text");
        result.current.setSelectedCategory("Image" as TemplateCategory);
      });

      expect(result.current.searchTerm).toBe("text");
      expect(result.current.selectedCategory).toBe("Image");

      // Open dialog
      act(() => {
        result.current.openDialog();
      });

      expect(result.current.isOpen).toBe(true);
      expect(result.current.searchTerm).toBe("");
      expect(result.current.selectedCategory).toBe("All");
      expect(result.current.selectedIndex).toBe(0);
    });
  });

  describe("closeDialog", () => {
    it("should close the dialog and reset filters", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      // Open dialog first
      act(() => {
        result.current.openDialog();
        result.current.setSearchTerm("test");
      });

      expect(result.current.isOpen).toBe(true);
      expect(result.current.searchTerm).toBe("test");

      // Close dialog
      act(() => {
        result.current.closeDialog();
      });

      expect(result.current.isOpen).toBe(false);
      expect(result.current.searchTerm).toBe("");
      expect(result.current.selectedCategory).toBe("All");
      expect(result.current.selectedIndex).toBe(0);
    });
  });

  describe("setSelectedCategory", () => {
    it("should filter templates by category", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.setSelectedCategory("Text");
      });

      expect(result.current.selectedCategory).toBe("Text");
      expect(result.current.filteredTemplates.every((t) => t.category === "Text")).toBe(true);
      expect(result.current.selectedIndex).toBe(0);
    });

    it("should show all templates when category is All", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.setSelectedCategory("Text");
      });

      expect(result.current.filteredTemplates.length).toBeLessThan(result.current.templates.length);

      act(() => {
        result.current.setSelectedCategory("All");
      });

      expect(result.current.filteredTemplates).toEqual(result.current.templates);
    });
  });

  describe("setSearchTerm", () => {
    it("should filter templates by search term", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.setSearchTerm("text");
      });

      expect(result.current.searchTerm).toBe("text");
      expect(result.current.filteredTemplates.every((t) =>
        t.name.toLowerCase().includes("text") ||
        t.description.toLowerCase().includes("text")
      )).toBe(true);
      expect(result.current.selectedIndex).toBe(0);
    });

    it("should be case insensitive", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.setSearchTerm("IMAGE");
      });

      const hasImageTemplate = result.current.filteredTemplates.some((t) =>
        t.name.toLowerCase().includes("image") ||
        t.description.toLowerCase().includes("image")
      );
      expect(hasImageTemplate).toBe(true);
    });

    it("should filter by category and search term together", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.setSelectedCategory("Text");
        result.current.setSearchTerm("batch");
      });

      expect(result.current.filteredTemplates.every((t) => t.category === "Text")).toBe(true);
      expect(
        result.current.filteredTemplates.every((t) =>
          t.name.toLowerCase().includes("batch") ||
          t.description.toLowerCase().includes("batch")
        )
      ).toBe(true);
    });

    it("should show empty results when no match found", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.setSearchTerm("nonexistenttemplate");
      });

      expect(result.current.filteredTemplates.length).toBe(0);
    });
  });

  describe("keyboard navigation", () => {
    it("should move selection down", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const initialIndex = result.current.selectedIndex;

      act(() => {
        result.current.moveSelectionDown();
      });

      expect(result.current.selectedIndex).toBe(initialIndex + 1);
    });

    it("should wrap to first item when moving down from last", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.setSelectedIndex(result.current.filteredTemplates.length - 1);
        result.current.moveSelectionDown();
      });

      expect(result.current.selectedIndex).toBe(0);
    });

    it("should move selection up", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.setSelectedIndex(2);
        result.current.moveSelectionUp();
      });

      expect(result.current.selectedIndex).toBe(1);
    });

    it("should wrap to last item when moving up from first", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.moveSelectionUp();
      });

      expect(result.current.selectedIndex).toBe(result.current.filteredTemplates.length - 1);
    });
  });

  describe("getSelectedTemplate", () => {
    it("should return the currently selected template", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.setSelectedIndex(0);
      });

      const selected = result.current.getSelectedTemplate();
      expect(selected).toEqual(result.current.filteredTemplates[0]);
    });

    it("should return null when index is out of bounds", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      act(() => {
        result.current.setSelectedIndex(-1);
      });

      expect(result.current.getSelectedTemplate()).toBeNull();

      act(() => {
        result.current.setSelectedIndex(999);
      });

      expect(result.current.getSelectedTemplate()).toBeNull();
    });
  });

  describe("setInsertPosition", () => {
    it("should update the insert position", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const newPosition = { x: 500, y: 300 };

      act(() => {
        result.current.setInsertPosition(newPosition);
      });

      expect(result.current.insertPosition).toEqual(newPosition);
    });
  });

  describe("template structure", () => {
    it("should have valid template structure", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      result.current.templates.forEach((template) => {
        expect(template).toHaveProperty("id");
        expect(template).toHaveProperty("name");
        expect(template).toHaveProperty("description");
        expect(template).toHaveProperty("category");
        expect(template).toHaveProperty("nodes");
        expect(template).toHaveProperty("connections");

        expect(template.id).toBeTruthy();
        expect(template.name).toBeTruthy();
        expect(template.description).toBeTruthy();
        expect(Array.isArray(template.nodes)).toBe(true);
        expect(Array.isArray(template.connections)).toBe(true);
      });
    });

    it("should have valid node structure in templates", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      result.current.templates.forEach((template) => {
        template.nodes.forEach((node) => {
          expect(node).toHaveProperty("type");
          expect(node).toHaveProperty("position");
          expect(node.position).toHaveProperty("x");
          expect(node.position).toHaveProperty("y");
          expect(typeof node.position.x).toBe("number");
          expect(typeof node.position.y).toBe("number");
        });
      });
    });

    it("should have valid connection structure in templates", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      result.current.templates.forEach((template) => {
        template.connections.forEach((conn) => {
          expect(conn).toHaveProperty("source");
          expect(conn).toHaveProperty("target");
          expect(conn).toHaveProperty("sourceHandle");
          expect(conn).toHaveProperty("targetHandle");

          // Source and target should be string indices
          expect(parseInt(conn.source, 10)).not.toBeNaN();
          expect(parseInt(conn.target, 10)).not.toBeNaN();
        });
      });
    });
  });

  describe("template categories", () => {
    it("should only use defined categories", () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const validCategories: TemplateCategory[] = ["Text", "Image", "Audio", "Video", "Logic", "Data"];

      result.current.templates.forEach((template) => {
        expect(validCategories).toContainEqual(template.category);
      });
    });
  });
});
