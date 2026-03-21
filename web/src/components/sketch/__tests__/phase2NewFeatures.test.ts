/**
 * Tests for Phase 2 New Features
 *
 * Tests for: gradient tool, crop tool, canvas background color,
 * gradient settings, and new tool types.
 */

import { act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import {
  DEFAULT_GRADIENT_SETTINGS,
  DEFAULT_TOOL_SETTINGS
} from "../types";

// Reset store before each test
beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
  });
});

describe("Phase 2 New Features", () => {
  describe("gradient settings", () => {
    it("has default gradient settings", () => {
      expect(DEFAULT_GRADIENT_SETTINGS).toEqual({
        startColor: "#ffffff",
        endColor: "#000000",
        type: "linear"
      });
    });

    it("includes gradient in default tool settings", () => {
      expect(DEFAULT_TOOL_SETTINGS.gradient).toEqual(
        DEFAULT_GRADIENT_SETTINGS
      );
    });

    it("document starts with default gradient settings", () => {
      const state = useSketchStore.getState();
      expect(state.document.toolSettings.gradient).toEqual(
        DEFAULT_GRADIENT_SETTINGS
      );
    });

    it("updates gradient start color", () => {
      act(() => {
        useSketchStore.getState().setGradientSettings({ startColor: "#ff0000" });
      });
      const settings = useSketchStore.getState().document.toolSettings.gradient;
      expect(settings.startColor).toBe("#ff0000");
      expect(settings.endColor).toBe("#000000");
      expect(settings.type).toBe("linear");
    });

    it("updates gradient end color", () => {
      act(() => {
        useSketchStore.getState().setGradientSettings({ endColor: "#00ff00" });
      });
      const settings = useSketchStore.getState().document.toolSettings.gradient;
      expect(settings.startColor).toBe("#ffffff");
      expect(settings.endColor).toBe("#00ff00");
    });

    it("updates gradient type to radial", () => {
      act(() => {
        useSketchStore.getState().setGradientSettings({ type: "radial" });
      });
      const settings = useSketchStore.getState().document.toolSettings.gradient;
      expect(settings.type).toBe("radial");
    });

    it("updates multiple gradient settings at once", () => {
      act(() => {
        useSketchStore.getState().setGradientSettings({
          startColor: "#ff0000",
          endColor: "#0000ff",
          type: "radial"
        });
      });
      const settings = useSketchStore.getState().document.toolSettings.gradient;
      expect(settings).toEqual({
        startColor: "#ff0000",
        endColor: "#0000ff",
        type: "radial"
      });
    });

    it("updates metadata timestamp when gradient settings change", () => {
      act(() => {
        useSketchStore.getState().setGradientSettings({ startColor: "#123456" });
      });
      const updatedAt = useSketchStore.getState().document.metadata.updatedAt;
      expect(updatedAt).toBeTruthy();
      expect(new Date(updatedAt).getTime()).toBeGreaterThan(0);
    });

    it("normalizes missing gradient settings when loading a document", () => {
      const doc = useSketchStore.getState().document;
      const legacyDoc = {
        ...doc,
        toolSettings: {
          ...doc.toolSettings
        }
      };
      delete legacyDoc.toolSettings.gradient;

      act(() => {
        useSketchStore.getState().setDocument(legacyDoc);
      });

      expect(useSketchStore.getState().document.toolSettings.gradient).toEqual(
        DEFAULT_GRADIENT_SETTINGS
      );
    });
  });

  describe("gradient tool type", () => {
    it("can set active tool to gradient", () => {
      act(() => {
        useSketchStore.getState().setActiveTool("gradient");
      });
      expect(useSketchStore.getState().activeTool).toBe("gradient");
    });
  });

  describe("crop tool type", () => {
    it("can set active tool to crop", () => {
      act(() => {
        useSketchStore.getState().setActiveTool("crop");
      });
      expect(useSketchStore.getState().activeTool).toBe("crop");
    });
  });

  describe("canvas background color", () => {
    it("starts with black background", () => {
      const state = useSketchStore.getState();
      expect(state.document.canvas.backgroundColor).toBe("#000000");
    });

    it("sets canvas background color", () => {
      act(() => {
        useSketchStore.getState().setCanvasBackgroundColor("#ffffff");
      });
      expect(
        useSketchStore.getState().document.canvas.backgroundColor
      ).toBe("#ffffff");
    });

    it("sets canvas background to gray", () => {
      act(() => {
        useSketchStore.getState().setCanvasBackgroundColor("#808080");
      });
      expect(
        useSketchStore.getState().document.canvas.backgroundColor
      ).toBe("#808080");
    });

    it("updates metadata timestamp when background color changes", () => {
      act(() => {
        useSketchStore.getState().setCanvasBackgroundColor("#ff0000");
      });
      const updatedAt = useSketchStore.getState().document.metadata.updatedAt;
      expect(updatedAt).toBeTruthy();
      expect(new Date(updatedAt).getTime()).toBeGreaterThan(0);
    });
  });

  describe("tool settings persistence across tool switches", () => {
    it("retains gradient settings when switching tools", () => {
      act(() => {
        useSketchStore.getState().setGradientSettings({
          startColor: "#ff0000",
          endColor: "#0000ff",
          type: "radial"
        });
        useSketchStore.getState().setActiveTool("brush");
        useSketchStore.getState().setActiveTool("gradient");
      });
      const settings = useSketchStore.getState().document.toolSettings.gradient;
      expect(settings).toEqual({
        startColor: "#ff0000",
        endColor: "#0000ff",
        type: "radial"
      });
    });
  });

  describe("tool types completeness", () => {
    const allTools = [
      "move", "brush", "pencil", "eraser", "eyedropper",
      "fill", "line", "rectangle", "ellipse", "arrow",
      "blur", "gradient", "crop"
    ] as const;

    it.each(allTools)("can set active tool to %s", (tool) => {
      act(() => {
        useSketchStore.getState().setActiveTool(tool);
      });
      expect(useSketchStore.getState().activeTool).toBe(tool);
    });
  });
});
