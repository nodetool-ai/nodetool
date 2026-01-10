import { renderHook, act } from "@testing-library/react";
import { useNodeTemplatesStore } from "../NodeTemplatesStore";

describe("NodeTemplatesStore", () => {
  beforeEach(() => {
    act(() => {
      useNodeTemplatesStore.setState({ templates: [] });
    });
  });

  describe("addTemplate", () => {
    it("should add a new template with all required fields", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      await act(async () => {
        await result.current.addTemplate(
          "Test Template",
          "nodetool.test.Node",
          { prop1: "value1", prop2: 42 },
          "Test description"
        );
      });

      const templates = result.current.templates;
      expect(templates).toHaveLength(1);
      const template = templates[0];
      expect(template.id).toBeDefined();
      expect(template.name).toBe("Test Template");
      expect(template.nodeType).toBe("nodetool.test.Node");
      expect(template.properties).toEqual({ prop1: "value1", prop2: 42 });
      expect(template.description).toBe("Test description");
      expect(template.usageCount).toBe(0);
      expect(template.createdAt).toBeDefined();
      expect(template.updatedAt).toBeDefined();
    });

    it("should generate unique IDs for each template", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const id1 = await act(async () => {
        return result.current.addTemplate("Template 1", "nodetool.test.Node", {});
      });

      const id2 = await act(async () => {
        return result.current.addTemplate("Template 2", "nodetool.test.Node", {});
      });

      expect(id1).not.toBe(id2);
      expect(result.current.templates).toHaveLength(2);
    });

    it("should default description to empty string", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      await act(async () => {
        result.current.addTemplate("Test", "nodetool.test.Node", {});
      });

      expect(result.current.templates[0].description).toBe("");
    });

    it("should limit templates per node type to MAX_TEMPLATES_PER_NODE_TYPE", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodeType = "nodetool.test.Node";

      for (let i = 0; i < 25; i++) {
        await act(async () => {
          result.current.addTemplate(`Template ${i}`, nodeType, { index: i });
        });
      }

      const templatesForType = result.current.getTemplatesForNodeType(nodeType);
      expect(templatesForType.length).toBeLessThanOrEqual(20);
    });

    it("should limit total templates to MAX_TOTAL_TEMPLATES", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      for (let i = 0; i < 120; i++) {
        await act(async () => {
          result.current.addTemplate(
            `Template ${i}`,
            `nodetool.test.Node${i % 10}`,
            { index: i }
          );
        });
      }

      expect(result.current.templates.length).toBeLessThanOrEqual(100);
    });

    it("should remove oldest template when limit is exceeded", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());
      const nodeType = "nodetool.test.Node";

      for (let i = 0; i < 22; i++) {
        await act(async () => {
          result.current.addTemplate(`Template ${i}`, nodeType, { index: i });
        });
      }

      const templates = result.current.templates;
      const oldestTemplates = templates.filter(t => t.name === "Template 0");
      expect(oldestTemplates).toHaveLength(0);
      const newestTemplates = templates.filter(t => t.name === "Template 21");
      expect(newestTemplates).toHaveLength(1);
    });
  });

  describe("updateTemplate", () => {
    it("should update template properties", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const templateId = await act(async () => {
        return result.current.addTemplate("Original", "nodetool.test.Node", { a: 1 });
      });

      await act(async () => {
        result.current.updateTemplate(templateId, {
          name: "Updated",
          description: "New description"
        });
      });

      const template = result.current.getTemplateById(templateId);
      expect(template?.name).toBe("Updated");
      expect(template?.description).toBe("New description");
      expect(template?.properties).toEqual({ a: 1 });
    });

    it("should update updatedAt timestamp", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const templateId = await act(async () => {
        return result.current.addTemplate("Test", "nodetool.test.Node", {});
      });

      const originalTemplate = result.current.getTemplateById(templateId);
      const originalUpdatedAt = originalTemplate?.updatedAt;

      await act(async () => {
        result.current.updateTemplate(templateId, { name: "Updated" });
      });

      const updatedTemplate = result.current.getTemplateById(templateId);
      expect(updatedTemplate?.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt || 0);
    });
  });

  describe("deleteTemplate", () => {
    it("should remove template by ID", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const templateId = await act(async () => {
        return result.current.addTemplate("Test", "nodetool.test.Node", {});
      });

      expect(result.current.templates).toHaveLength(1);

      await act(async () => {
        result.current.deleteTemplate(templateId);
      });

      expect(result.current.templates).toHaveLength(0);
      expect(result.current.getTemplateById(templateId)).toBeUndefined();
    });

    it("should handle deleting non-existent template gracefully", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      await act(async () => {
        result.current.deleteTemplate("non-existent-id");
      });

      expect(result.current.templates).toHaveLength(0);
    });
  });

  describe("getTemplatesForNodeType", () => {
    it("should return only templates for specified node type", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      await act(async () => {
        result.current.addTemplate("Template 1", "nodetool.input.StringInput", {});
        result.current.addTemplate("Template 2", "nodetool.llm.LLM", {});
        result.current.addTemplate("Template 3", "nodetool.input.StringInput", {});
      });

      const stringInputTemplates = result.current.getTemplatesForNodeType("nodetool.input.StringInput");
      const llmTemplates = result.current.getTemplatesForNodeType("nodetool.llm.LLM");

      expect(stringInputTemplates).toHaveLength(2);
      expect(stringInputTemplates.every(t => t.nodeType === "nodetool.input.StringInput")).toBe(true);
      expect(llmTemplates).toHaveLength(1);
      expect(llmTemplates[0].nodeType).toBe("nodetool.llm.LLM");
    });

    it("should return empty array for non-existent node type", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      await act(async () => {
        result.current.addTemplate("Test", "nodetool.test.Node", {});
      });

      const templates = result.current.getTemplatesForNodeType("nodetool.nonexistent.Type");
      expect(templates).toHaveLength(0);
    });

    it("should sort by usage count descending, then by updatedAt descending", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const id1 = await act(async () => {
        return result.current.addTemplate("Template 1", "nodetool.test.Node", {});
      });

      const id2 = await act(async () => {
        return result.current.addTemplate("Template 2", "nodetool.test.Node", {});
      });

      await act(async () => {
        result.current.incrementUsage(id1);
        result.current.incrementUsage(id1);
        result.current.incrementUsage(id2);
      });

      const templates = result.current.getTemplatesForNodeType("nodetool.test.Node");
      expect(templates[0].name).toBe("Template 1");
      expect(templates[1].name).toBe("Template 2");
    });
  });

  describe("getTemplateById", () => {
    it("should return template when found", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const templateId = await act(async () => {
        return result.current.addTemplate("Test", "nodetool.test.Node", {});
      });

      const template = result.current.getTemplateById(templateId);
      expect(template).toBeDefined();
      expect(template?.name).toBe("Test");
    });

    it("should return undefined when not found", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const template = result.current.getTemplateById("non-existent-id");
      expect(template).toBeUndefined();
    });
  });

  describe("incrementUsage", () => {
    it("should increase usage count by 1", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const templateId = await act(async () => {
        return result.current.addTemplate("Test", "nodetool.test.Node", {});
      });

      expect(result.current.getTemplateById(templateId)?.usageCount).toBe(0);

      await act(async () => {
        result.current.incrementUsage(templateId);
      });

      expect(result.current.getTemplateById(templateId)?.usageCount).toBe(1);

      await act(async () => {
        result.current.incrementUsage(templateId);
      });

      expect(result.current.getTemplateById(templateId)?.usageCount).toBe(2);
    });
  });

  describe("clearAllTemplates", () => {
    it("should remove all templates", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      await act(async () => {
        result.current.addTemplate("Template 1", "nodetool.test.Node", {});
        result.current.addTemplate("Template 2", "nodetool.test.Node", {});
        result.current.addTemplate("Template 3", "nodetool.other.Node", {});
      });

      expect(result.current.templates).toHaveLength(3);

      await act(async () => {
        result.current.clearAllTemplates();
      });

      expect(result.current.templates).toHaveLength(0);
    });
  });

  describe("renameTemplate", () => {
    it("should rename template", async () => {
      const { result } = renderHook(() => useNodeTemplatesStore());

      const templateId = await act(async () => {
        return result.current.addTemplate("Original", "nodetool.test.Node", {});
      });

      await act(async () => {
        result.current.renameTemplate(templateId, "New Name");
      });

      expect(result.current.getTemplateById(templateId)?.name).toBe("New Name");
    });
  });
});
