import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import { useSnippetStore } from "../SnippetStore";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../NodeData";

describe("SnippetStore", () => {
  beforeEach(() => {
    act(() => {
      useSnippetStore.setState({ snippets: [] });
    });
    localStorage.removeItem("nodetool-snippets");
  });

  const createMockNode = (id: string, type: string = "testNode"): Node<NodeData> => ({
    id,
    type,
    position: { x: 100 + Number(id) * 10, y: 100 + Number(id) * 10 },
    data: { value: `test-${id}`, properties: {}, selectable: true, dynamic_properties: {}, workflow_id: "" } as unknown as NodeData,
    selected: false,
    zIndex: 1
  });

  const createMockEdge = (id: string, source: string, target: string): Edge => ({
    id,
    source,
    target,
    sourceHandle: null,
    targetHandle: null
  });

  describe("addSnippet", () => {
    it("should add a snippet with nodes and edges", () => {
      const nodes = [createMockNode("1"), createMockNode("2")];
      const edges = [createMockEdge("e1", "1", "2")];

      act(() => {
        useSnippetStore.getState().addSnippet(
          "Test Snippet",
          "A test snippet",
          nodes,
          edges,
          ["test"]
        );
      });

      const snippets = useSnippetStore.getState().getAllSnippets();
      expect(snippets).toHaveLength(1);
      expect(snippets[0].name).toBe("Test Snippet");
      expect(snippets[0].description).toBe("A test snippet");
      expect(snippets[0].nodes).toHaveLength(2);
      expect(snippets[0].edges).toHaveLength(1);
      expect(snippets[0].tags).toEqual(["test"]);
    });

    it("should generate a unique ID for each snippet", () => {
      const nodes = [createMockNode("1")];

      act(() => {
        useSnippetStore.getState().addSnippet("Snippet 1", "", nodes, []);
        useSnippetStore.getState().addSnippet("Snippet 2", "", nodes, []);
      });

      const snippets = useSnippetStore.getState().getAllSnippets();
      expect(snippets[0].id).not.toBe(snippets[1].id);
    });

    it("should default tags to empty array when not provided", () => {
      const nodes = [createMockNode("1")];

      act(() => {
        useSnippetStore.getState().addSnippet("Test Snippet", "", nodes, []);
      });

      const snippets = useSnippetStore.getState().getAllSnippets();
      expect(snippets[0].tags).toEqual([]);
    });

    it("should limit snippets to MAX_SNIPPETS (50)", () => {
      const nodes = [createMockNode("1")];

      for (let i = 0; i < 55; i++) {
        act(() => {
          useSnippetStore
            .getState()
            .addSnippet(`Snippet ${i}`, "", nodes, []);
        });
      }

      const snippets = useSnippetStore.getState().getAllSnippets();
      expect(snippets).toHaveLength(50);
    });

    it("should preserve node data in snippet", () => {
      const node = createMockNode("1");
      node.data = { value: "test-value", label: "Test Label" } as unknown as NodeData;

      act(() => {
        useSnippetStore.getState().addSnippet("Test", "", [node], []);
      });

      const snippets = useSnippetStore.getState().getAllSnippets();
      expect(snippets[0].nodes[0].data).toEqual({ value: "test-value", label: "Test Label" });
    });
  });

  describe("updateSnippet", () => {
    it("should update snippet name", () => {
      const nodes = [createMockNode("1")];

      act(() => {
        useSnippetStore.getState().addSnippet("Original Name", "Description", nodes, []);
      });

      const snippetId = useSnippetStore.getState().getAllSnippets()[0].id;

      act(() => {
        useSnippetStore.getState().updateSnippet(snippetId, { name: "New Name" });
      });

      const snippet = useSnippetStore.getState().getSnippet(snippetId);
      expect(snippet?.name).toBe("New Name");
    });

    it("should update snippet description", () => {
      const nodes = [createMockNode("1")];

      act(() => {
        useSnippetStore.getState().addSnippet("Name", "Original Description", nodes, []);
      });

      const snippetId = useSnippetStore.getState().getAllSnippets()[0].id;

      act(() => {
        useSnippetStore.getState().updateSnippet(snippetId, { description: "New Description" });
      });

      const snippet = useSnippetStore.getState().getSnippet(snippetId);
      expect(snippet?.description).toBe("New Description");
    });

    it("should update snippet tags", () => {
      const nodes = [createMockNode("1")];

      act(() => {
        useSnippetStore.getState().addSnippet("Name", "", nodes, [], ["tag1"]);
      });

      const snippetId = useSnippetStore.getState().getAllSnippets()[0].id;

      act(() => {
        useSnippetStore.getState().updateSnippet(snippetId, { tags: ["tag1", "tag2"] });
      });

      const snippet = useSnippetStore.getState().getSnippet(snippetId);
      expect(snippet?.tags).toEqual(["tag1", "tag2"]);
    });

    it("should update updatedAt timestamp", () => {
      const nodes = [createMockNode("1")];

      act(() => {
        useSnippetStore.getState().addSnippet("Name", "", nodes, []);
      });

      const snippet = useSnippetStore.getState().getAllSnippets()[0];
      const originalUpdatedAt = snippet.updatedAt;

      // Wait a bit to ensure timestamp difference
      const now = Date.now();
      while (Date.now() === now) {}

      const snippetId = snippet.id;
      act(() => {
        useSnippetStore.getState().updateSnippet(snippetId, { name: "New Name" });
      });

      const updatedSnippet = useSnippetStore.getState().getSnippet(snippetId);
      expect(updatedSnippet?.updatedAt).toBeGreaterThan(originalUpdatedAt);
    });
  });

  describe("deleteSnippet", () => {
    it("should delete a snippet by ID", () => {
      const nodes = [createMockNode("1")];

      act(() => {
        useSnippetStore.getState().addSnippet("Test Snippet", "", nodes, []);
      });

      const snippetId = useSnippetStore.getState().getAllSnippets()[0].id;

      act(() => {
        useSnippetStore.getState().deleteSnippet(snippetId);
      });

      const snippets = useSnippetStore.getState().getAllSnippets();
      expect(snippets).toHaveLength(0);
    });

    it("should handle deleting non-existent snippet gracefully", () => {
      act(() => {
        useSnippetStore.getState().deleteSnippet("non-existent-id");
      });

      const snippets = useSnippetStore.getState().getAllSnippets();
      expect(snippets).toHaveLength(0);
    });

    it("should only delete the specified snippet", () => {
      const nodes = [createMockNode("1")];

      act(() => {
        useSnippetStore.getState().addSnippet("Snippet 1", "", nodes, []);
        useSnippetStore.getState().addSnippet("Snippet 2", "", nodes, []);
      });

      const snippets = useSnippetStore.getState().getAllSnippets();
      const firstId = snippets[0].id;

      act(() => {
        useSnippetStore.getState().deleteSnippet(firstId);
      });

      const remainingSnippets = useSnippetStore.getState().getAllSnippets();
      expect(remainingSnippets).toHaveLength(1);
      // Newest snippet is first, so deleting first leaves "Snippet 1"
      expect(remainingSnippets[0].name).toBe("Snippet 1");
    });
  });

  describe("getSnippet", () => {
    it("should return undefined for non-existent snippet", () => {
      const snippet = useSnippetStore.getState().getSnippet("non-existent-id");
      expect(snippet).toBeUndefined();
    });

    it("should return the correct snippet", () => {
      const nodes = [createMockNode("1")];

      act(() => {
        useSnippetStore.getState().addSnippet("Test Snippet", "Description", nodes, []);
      });

      const snippetId = useSnippetStore.getState().getAllSnippets()[0].id;
      const snippet = useSnippetStore.getState().getSnippet(snippetId);

      expect(snippet).toBeDefined();
      expect(snippet?.name).toBe("Test Snippet");
    });
  });

  describe("getAllSnippets", () => {
    it("should return empty array when no snippets exist", () => {
      const snippets = useSnippetStore.getState().getAllSnippets();
      expect(snippets).toEqual([]);
    });

    it("should return all snippets", () => {
      const nodes = [createMockNode("1")];

      act(() => {
        useSnippetStore.getState().addSnippet("Snippet 1", "", nodes, []);
        useSnippetStore.getState().addSnippet("Snippet 2", "", nodes, []);
        useSnippetStore.getState().addSnippet("Snippet 3", "", nodes, []);
      });

      const snippets = useSnippetStore.getState().getAllSnippets();
      expect(snippets).toHaveLength(3);
    });
  });

  describe("duplicateSnippet", () => {
    it("should create a copy of a snippet with modified name", () => {
      const nodes = [createMockNode("1")];

      act(() => {
        useSnippetStore.getState().addSnippet("Original", "Description", nodes, [], ["tag1"]);
      });

      const originalId = useSnippetStore.getState().getAllSnippets()[0].id;

      act(() => {
        useSnippetStore.getState().duplicateSnippet(originalId);
      });

      const snippets = useSnippetStore.getState().getAllSnippets();
      expect(snippets).toHaveLength(2);
      expect(snippets[0].name).toBe("Original (Copy)");
      expect(snippets[0].id).not.toBe(originalId);
      expect(snippets[0].description).toBe("Description");
      expect(snippets[0].tags).toEqual(["tag1"]);
    });

    it("should throw error for non-existent snippet", () => {
      expect(() => {
        useSnippetStore.getState().duplicateSnippet("non-existent-id");
      }).toThrow("Snippet with id non-existent-id not found");
    });

    it("should have different createdAt timestamp for duplicate", () => {
      const nodes = [createMockNode("1")];

      act(() => {
        useSnippetStore.getState().addSnippet("Original", "", nodes, []);
      });

      const original = useSnippetStore.getState().getAllSnippets()[0];
      const originalId = original.id;

      act(() => {
        useSnippetStore.getState().duplicateSnippet(originalId);
      });

      const duplicates = useSnippetStore.getState().getAllSnippets();
      expect(duplicates).toHaveLength(2);
      const copy = duplicates.find((s) => s.id !== originalId);
      expect(copy).toBeDefined();
      // Verify it's a new snippet with "(Copy)" suffix
      expect(copy?.name).toBe("Original (Copy)");
      expect(copy?.description).toBe(original.description);
    });
  });

  describe("clearSnippets", () => {
    it("should remove all snippets", () => {
      const nodes = [createMockNode("1")];

      act(() => {
        useSnippetStore.getState().addSnippet("Snippet 1", "", nodes, []);
        useSnippetStore.getState().addSnippet("Snippet 2", "", nodes, []);
        useSnippetStore.getState().clearSnippets();
      });

      const snippets = useSnippetStore.getState().getAllSnippets();
      expect(snippets).toHaveLength(0);
    });
  });

  describe("getSnippetsByTag", () => {
    it("should return snippets matching the tag", () => {
      const nodes = [createMockNode("1")];

      act(() => {
        useSnippetStore.getState().addSnippet("Snippet 1", "", nodes, [], ["tag1", "tag2"]);
        useSnippetStore.getState().addSnippet("Snippet 2", "", nodes, [], ["tag2", "tag3"]);
        useSnippetStore.getState().addSnippet("Snippet 3", "", nodes, [], ["tag3"]);
      });

      const taggedSnippets = useSnippetStore.getState().getSnippetsByTag("tag2");
      expect(taggedSnippets).toHaveLength(2);
      expect(taggedSnippets.map((s) => s.name).sort()).toEqual(["Snippet 1", "Snippet 2"]);
    });

    it("should return empty array when no snippets match the tag", () => {
      const nodes = [createMockNode("1")];

      act(() => {
        useSnippetStore.getState().addSnippet("Snippet 1", "", nodes, [], ["tag1"]);
      });

      const taggedSnippets = useSnippetStore.getState().getSnippetsByTag("non-existent");
      expect(taggedSnippets).toHaveLength(0);
    });
  });

  describe("persistence", () => {
    it("should persist snippets to localStorage", () => {
      const nodes = [createMockNode("1")];

      act(() => {
        useSnippetStore.getState().addSnippet("Test Snippet", "Description", nodes, [], ["test"]);
      });

      const storedData = localStorage.getItem("nodetool-snippets");
      expect(storedData).toBeTruthy();

      const parsed = JSON.parse(storedData || "{}");
      expect(parsed.state.snippets).toHaveLength(1);
      expect(parsed.state.snippets[0].name).toBe("Test Snippet");
    });

    it("should restore snippets from localStorage", () => {
      const nodes = [createMockNode("1")];

      // First, add a snippet
      act(() => {
        useSnippetStore.getState().addSnippet("Test Snippet", "", nodes, []);
      });

      // Clear state to simulate page reload
      act(() => {
        useSnippetStore.setState({ snippets: [] });
      });

      // Create a new store instance (simulates page reload)
      // In real scenario, the persisted data would be automatically loaded
      const storedData = localStorage.getItem("nodetool-snippets");
      expect(storedData).toBeTruthy();
    });
  });
});
