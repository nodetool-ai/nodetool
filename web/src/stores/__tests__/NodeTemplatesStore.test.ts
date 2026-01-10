import { describe, it, expect, beforeEach } from "@jest/globals";
import { act } from "@testing-library/react";
import { useNodeTemplatesStore } from "../NodeTemplatesStore";

describe("NodeTemplatesStore", () => {
  beforeEach(() => {
    act(() => {
      useNodeTemplatesStore.setState({ templates: [] });
    });
    localStorage.removeItem("nodetool-node-templates");
  });

  describe("addTemplate", () => {
    it("should add a new template", () => {
      act(() => {
        useNodeTemplatesStore
          .getState()
          .addTemplate(
            "My Template",
            "nodetool.test.Node",
            { prop1: "value1" },
            "A test template"
          );
      });

      const templates = useNodeTemplatesStore.getState().templates;
      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe("My Template");
      expect(templates[0].nodeType).toBe("nodetool.test.Node");
      expect(templates[0].properties).toEqual({ prop1: "value1" });
      expect(templates[0].description).toBe("A test template");
      expect(templates[0].usageCount).toBe(0);
    });

    it("should add new templates to the front of the list", () => {
      act(() => {
        useNodeTemplatesStore
          .getState()
          .addTemplate("First", "nodetool.test.Node1", {});
        useNodeTemplatesStore
          .getState()
          .addTemplate("Second", "nodetool.test.Node2", {});
      });

      const templates = useNodeTemplatesStore.getState().templates;
      expect(templates[0].name).toBe("Second");
      expect(templates[1].name).toBe("First");
    });

    it("should limit templates to MAX_TEMPLATES (50)", () => {
      for (let i = 0; i < 55; i++) {
        act(() => {
          useNodeTemplatesStore
            .getState()
            .addTemplate(`Template${i}`, `nodetool.test.Node${i}`, {});
        });
      }

      const templates = useNodeTemplatesStore.getState().templates;
      expect(templates).toHaveLength(50);
      expect(templates[0].name).toBe("Template54");
    });

    it("should generate unique IDs for each template", () => {
      useNodeTemplatesStore
        .getState()
        .addTemplate("Template1", "nodetool.test.Node", {});
      const templates1 = useNodeTemplatesStore.getState().templates;

      useNodeTemplatesStore
        .getState()
        .addTemplate("Template2", "nodetool.test.Node", {});
      const templates2 = useNodeTemplatesStore.getState().templates;

      expect(templates1[0].id).not.toBe(templates2[0].id);
    });
  });

  describe("updateTemplate", () => {
    it("should update template properties", () => {
      const id = useNodeTemplatesStore
        .getState()
        .addTemplate("Original", "nodetool.test.Node", { prop: "value" });

      act(() => {
        useNodeTemplatesStore.getState().updateTemplate(id, {
          name: "Updated",
          description: "New description"
        });
      });

      const template = useNodeTemplatesStore.getState().getTemplate(id);
      expect(template?.name).toBe("Updated");
      expect(template?.description).toBe("New description");
      expect(template?.properties).toEqual({ prop: "value" });
    });

    it("should update the updatedAt timestamp", () => {
      const id = useNodeTemplatesStore
        .getState()
        .addTemplate("Template", "nodetool.test.Node", {});

      const originalTemplate = useNodeTemplatesStore.getState().getTemplate(id);
      const originalUpdatedAt = originalTemplate?.updatedAt;

      act(() => {
        useNodeTemplatesStore.getState().updateTemplate(id, { name: "New" });
      });

      const updatedTemplate = useNodeTemplatesStore.getState().getTemplate(id);
      expect(updatedTemplate?.updatedAt).toBeGreaterThanOrEqual(
        originalUpdatedAt ?? 0
      );
    });
  });

  describe("deleteTemplate", () => {
    it("should remove a template by ID", () => {
      const id = useNodeTemplatesStore
        .getState()
        .addTemplate("Template", "nodetool.test.Node", {});

      act(() => {
        useNodeTemplatesStore.getState().deleteTemplate(id);
      });

      const templates = useNodeTemplatesStore.getState().templates;
      expect(templates).toHaveLength(0);
      expect(useNodeTemplatesStore.getState().getTemplate(id)).toBeUndefined();
    });

    it("should handle deleting non-existent template gracefully", () => {
      act(() => {
        useNodeTemplatesStore.getState().deleteTemplate("non-existent-id");
      });

      const templates = useNodeTemplatesStore.getState().templates;
      expect(templates).toHaveLength(0);
    });
  });

  describe("getTemplate", () => {
    it("should return a template by ID", () => {
      const id = useNodeTemplatesStore
        .getState()
        .addTemplate("My Template", "nodetool.test.Node", { key: "value" });

      const template = useNodeTemplatesStore.getState().getTemplate(id);
      expect(template).toBeDefined();
      expect(template?.name).toBe("My Template");
    });

    it("should return undefined for non-existent ID", () => {
      const template = useNodeTemplatesStore.getState().getTemplate(
        "non-existent"
      );
      expect(template).toBeUndefined();
    });
  });

  describe("getTemplatesForNodeType", () => {
    it("should return templates filtered by node type", () => {
      useNodeTemplatesStore.getState().addTemplate("T1", "nodetool.type.A", {});
      useNodeTemplatesStore.getState().addTemplate("T2", "nodetool.type.B", {});
      useNodeTemplatesStore.getState().addTemplate("T3", "nodetool.type.A", {});

      const templatesA = useNodeTemplatesStore
        .getState()
        .getTemplatesForNodeType("nodetool.type.A");
      expect(templatesA).toHaveLength(2);
      expect(templatesA.every((t) => t.nodeType === "nodetool.type.A")).toBe(
        true
      );

      const templatesB = useNodeTemplatesStore
        .getState()
        .getTemplatesForNodeType("nodetool.type.B");
      expect(templatesB).toHaveLength(1);
    });

    it("should sort templates by usage count descending", () => {
      const id1 = useNodeTemplatesStore
        .getState()
        .addTemplate("T1", "nodetool.type.A", {});
      const id2 = useNodeTemplatesStore
        .getState()
        .addTemplate("T2", "nodetool.type.A", {});
      const id3 = useNodeTemplatesStore
        .getState()
        .addTemplate("T3", "nodetool.type.A", {});

      act(() => {
        useNodeTemplatesStore.getState().incrementUsage(id1);
        useNodeTemplatesStore.getState().incrementUsage(id1);
        useNodeTemplatesStore.getState().incrementUsage(id2);
      });

      const templates = useNodeTemplatesStore
        .getState()
        .getTemplatesForNodeType("nodetool.type.A");
      expect(templates[0].id).toBe(id1);
      expect(templates[1].id).toBe(id2);
      expect(templates[2].id).toBe(id3);
    });
  });

  describe("incrementUsage", () => {
    it("should increment the usage count", () => {
      const id = useNodeTemplatesStore
        .getState()
        .addTemplate("Template", "nodetool.test.Node", {});

      act(() => {
        useNodeTemplatesStore.getState().incrementUsage(id);
        useNodeTemplatesStore.getState().incrementUsage(id);
      });

      const template = useNodeTemplatesStore.getState().getTemplate(id);
      expect(template?.usageCount).toBe(2);
    });
  });

  describe("clearTemplates", () => {
    it("should remove all templates", () => {
      useNodeTemplatesStore
        .getState()
        .addTemplate("T1", "nodetool.test.Node1", {});
      useNodeTemplatesStore
        .getState()
        .addTemplate("T2", "nodetool.test.Node2", {});

      act(() => {
        useNodeTemplatesStore.getState().clearTemplates();
      });

      const templates = useNodeTemplatesStore.getState().templates;
      expect(templates).toHaveLength(0);
    });
  });

  describe("reorderTemplates", () => {
    beforeEach(() => {
      act(() => {
        useNodeTemplatesStore.setState({ templates: [] });
      });
    });

    it("should reorder templates by moving element from one position to another", () => {
      // Templates are added to the front, so reverse the order
      act(() => {
        useNodeTemplatesStore.getState().addTemplate("C", "nodetool.test.Node", {});
        useNodeTemplatesStore.getState().addTemplate("B", "nodetool.test.Node", {});
        useNodeTemplatesStore.getState().addTemplate("A", "nodetool.test.Node", {});
      });

      const beforeReorder = useNodeTemplatesStore.getState().templates;
      expect(beforeReorder.map(t => t.name)).toEqual(["A", "B", "C"]);

      act(() => {
        useNodeTemplatesStore.getState().reorderTemplates(0, 2);
      });

      const templates = useNodeTemplatesStore.getState().templates;
      expect(templates.map(t => t.name)).toEqual(["B", "C", "A"]);
    });

    it("should handle reorder within bounds", () => {
      act(() => {
        useNodeTemplatesStore.getState().addTemplate("C", "nodetool.test.Node", {});
        useNodeTemplatesStore.getState().addTemplate("B", "nodetool.test.Node", {});
        useNodeTemplatesStore.getState().addTemplate("A", "nodetool.test.Node", {});
      });

      act(() => {
        useNodeTemplatesStore.getState().reorderTemplates(0, 1);
      });

      const templates = useNodeTemplatesStore.getState().templates;
      expect(templates.map(t => t.name)).toEqual(["B", "A", "C"]);
    });
  });
});
