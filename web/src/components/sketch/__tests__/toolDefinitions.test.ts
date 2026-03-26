/**
 * Tests for shared tool definitions
 */

import {
  ALL_TOOL_DEFINITIONS,
  PAINTING_TOOLS,
  SHAPE_TOOLS,
  CONTEXT_MENU_TOOLS,
  getToolDefinition
} from "../toolDefinitions";
import type { SketchTool } from "../types";

describe("toolDefinitions", () => {
  describe("ALL_TOOL_DEFINITIONS", () => {
    it("includes all painting and shape tools", () => {
      expect(ALL_TOOL_DEFINITIONS.length).toBe(
        PAINTING_TOOLS.length + SHAPE_TOOLS.length
      );
    });

    it("has unique tool names", () => {
      const names = ALL_TOOL_DEFINITIONS.map((d) => d.tool);
      expect(new Set(names).size).toBe(names.length);
    });

    it("every definition has a label and Icon", () => {
      for (const def of ALL_TOOL_DEFINITIONS) {
        expect(def.label).toBeTruthy();
        expect(def.Icon).toBeDefined();
      }
    });

    it("every definition has a group", () => {
      for (const def of ALL_TOOL_DEFINITIONS) {
        expect(["painting", "shape"]).toContain(def.group);
      }
    });
  });

  describe("PAINTING_TOOLS", () => {
    it("contains the expected painting tools", () => {
      const tools = PAINTING_TOOLS.map((d) => d.tool);
      expect(tools).toContain("move");
      expect(tools).toContain("brush");
      expect(tools).toContain("pencil");
      expect(tools).toContain("eraser");
      expect(tools).toContain("fill");
      expect(tools).toContain("eyedropper");
      expect(tools).toContain("blur");
      expect(tools).toContain("clone_stamp");
    });

    it("all have group painting", () => {
      for (const def of PAINTING_TOOLS) {
        expect(def.group).toBe("painting");
      }
    });
  });

  describe("SHAPE_TOOLS", () => {
    it("contains the expected shape tools", () => {
      const tools = SHAPE_TOOLS.map((d) => d.tool);
      expect(tools).toContain("shape");
      expect(tools).toContain("gradient");
      expect(tools).toContain("crop");
      expect(tools).toContain("adjust");
    });

    it("all have group shape", () => {
      for (const def of SHAPE_TOOLS) {
        expect(def.group).toBe("shape");
      }
    });
  });

  describe("CONTEXT_MENU_TOOLS", () => {
    it("excludes adjust tool", () => {
      const tools = CONTEXT_MENU_TOOLS.map((d) => d.tool);
      expect(tools).not.toContain("adjust");
    });

    it("includes all other tools", () => {
      const allExceptAdjust = ALL_TOOL_DEFINITIONS.filter(
        (d) => d.tool !== "adjust"
      );
      expect(CONTEXT_MENU_TOOLS.length).toBe(allExceptAdjust.length);
    });
  });

  describe("getToolDefinition", () => {
    it("returns the correct definition for a known tool", () => {
      const def = getToolDefinition("brush");
      expect(def.tool).toBe("brush");
      expect(def.label).toBe("Brush");
      expect(def.shortcut).toBe("B");
    });

    it("returns the correct definition for clone_stamp", () => {
      const def = getToolDefinition("clone_stamp");
      expect(def.tool).toBe("clone_stamp");
      expect(def.label).toBe("Clone Stamp");
      expect(def.shortcut).toBe("S");
    });

    it("returns move (first painting tool) for unknown tool", () => {
      const def = getToolDefinition("nonexistent" as SketchTool);
      expect(def.tool).toBe("move");
    });

    it("returns definition with shortcut for tools that have one", () => {
      const brushDef = getToolDefinition("brush");
      expect(brushDef.shortcut).toBeDefined();

      const eraserDef = getToolDefinition("eraser");
      expect(eraserDef.shortcut).toBe("E");
    });

    it("returns definition without shortcut for select tool", () => {
      const def = getToolDefinition("select");
      expect(def.shortcut).toBeUndefined();
    });
  });
});
