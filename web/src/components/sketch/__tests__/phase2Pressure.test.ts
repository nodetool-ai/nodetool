/**
 * Tests for Phase 2 features: Pressure sensitivity, brush roundness/angle,
 * rectangle selection tool, and input image loading fix.
 */

import { act } from "@testing-library/react";
import { useSketchStore } from "../state/useSketchStore";
import {
  DEFAULT_BRUSH_SETTINGS,
  normalizeSketchDocument,
  createDefaultDocument,
  SketchDocument
} from "../types";

// Reset store before each test
beforeEach(() => {
  act(() => {
    useSketchStore.getState().resetDocument();
  });
});

describe("Pressure sensitivity", () => {
  it("default brush settings include pressure sensitivity enabled", () => {
    expect(DEFAULT_BRUSH_SETTINGS.pressureSensitivity).toBe(true);
  });

  it("default brush settings affect both size and opacity", () => {
    expect(DEFAULT_BRUSH_SETTINGS.pressureAffects).toBe("both");
  });

  it("store brush settings include pressure sensitivity", () => {
    const state = useSketchStore.getState();
    expect(state.document.toolSettings.brush.pressureSensitivity).toBe(true);
    expect(state.document.toolSettings.brush.pressureAffects).toBe("both");
  });

  it("can update pressure sensitivity settings", () => {
    act(() => {
      useSketchStore.getState().setBrushSettings({
        pressureSensitivity: false,
        pressureAffects: "size"
      });
    });
    const state = useSketchStore.getState();
    expect(state.document.toolSettings.brush.pressureSensitivity).toBe(false);
    expect(state.document.toolSettings.brush.pressureAffects).toBe("size");
  });

  it("can set pressure to affect only opacity", () => {
    act(() => {
      useSketchStore.getState().setBrushSettings({
        pressureAffects: "opacity"
      });
    });
    expect(useSketchStore.getState().document.toolSettings.brush.pressureAffects).toBe("opacity");
  });
});

describe("Brush roundness and angle", () => {
  it("default brush settings have roundness 1.0 (perfect circle)", () => {
    expect(DEFAULT_BRUSH_SETTINGS.roundness).toBe(1.0);
  });

  it("default brush settings have angle 0", () => {
    expect(DEFAULT_BRUSH_SETTINGS.angle).toBe(0);
  });

  it("store brush settings include roundness and angle", () => {
    const state = useSketchStore.getState();
    expect(state.document.toolSettings.brush.roundness).toBe(1.0);
    expect(state.document.toolSettings.brush.angle).toBe(0);
  });

  it("can update roundness", () => {
    act(() => {
      useSketchStore.getState().setBrushSettings({ roundness: 0.5 });
    });
    expect(useSketchStore.getState().document.toolSettings.brush.roundness).toBe(0.5);
  });

  it("can update angle", () => {
    act(() => {
      useSketchStore.getState().setBrushSettings({ angle: 45 });
    });
    expect(useSketchStore.getState().document.toolSettings.brush.angle).toBe(45);
  });

  it("can update both roundness and angle together", () => {
    act(() => {
      useSketchStore.getState().setBrushSettings({ roundness: 0.3, angle: 120 });
    });
    const brush = useSketchStore.getState().document.toolSettings.brush;
    expect(brush.roundness).toBe(0.3);
    expect(brush.angle).toBe(120);
  });
});

describe("Backward compatibility - normalizeSketchDocument", () => {
  it("adds missing pressure settings to older documents", () => {
    // Simulate an older document without pressure settings
    const oldDoc = createDefaultDocument();
    const oldBrush = { ...oldDoc.toolSettings.brush };
    // Remove new fields to simulate old format
    const { pressureSensitivity, pressureAffects, roundness, angle, ...legacyBrush } = oldBrush;
    const legacyDoc: SketchDocument = {
      ...oldDoc,
      toolSettings: {
        ...oldDoc.toolSettings,
        brush: legacyBrush as typeof oldDoc.toolSettings.brush
      }
    };

    const normalized = normalizeSketchDocument(legacyDoc);
    expect(normalized.toolSettings.brush.pressureSensitivity).toBe(true);
    expect(normalized.toolSettings.brush.pressureAffects).toBe("both");
    expect(normalized.toolSettings.brush.roundness).toBe(1.0);
    expect(normalized.toolSettings.brush.angle).toBe(0);
  });

  it("preserves existing pressure settings in newer documents", () => {
    const doc = createDefaultDocument();
    doc.toolSettings.brush.pressureSensitivity = false;
    doc.toolSettings.brush.pressureAffects = "size";
    doc.toolSettings.brush.roundness = 0.5;
    doc.toolSettings.brush.angle = 90;

    const normalized = normalizeSketchDocument(doc);
    expect(normalized.toolSettings.brush.pressureSensitivity).toBe(false);
    expect(normalized.toolSettings.brush.pressureAffects).toBe("size");
    expect(normalized.toolSettings.brush.roundness).toBe(0.5);
    expect(normalized.toolSettings.brush.angle).toBe(90);
  });
});

describe("Rectangle selection tool", () => {
  it("initial selection is null", () => {
    expect(useSketchStore.getState().selection).toBeNull();
  });

  it("can set a selection", () => {
    act(() => {
      useSketchStore.getState().setSelection({ x: 10, y: 20, width: 100, height: 50 });
    });
    const sel = useSketchStore.getState().selection;
    expect(sel).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it("can clear a selection", () => {
    act(() => {
      useSketchStore.getState().setSelection({ x: 10, y: 20, width: 100, height: 50 });
    });
    expect(useSketchStore.getState().selection).not.toBeNull();

    act(() => {
      useSketchStore.getState().setSelection(null);
    });
    expect(useSketchStore.getState().selection).toBeNull();
  });

  it("selectAll sets selection to full canvas", () => {
    act(() => {
      useSketchStore.getState().selectAll();
    });
    const sel = useSketchStore.getState().selection;
    expect(sel).toEqual({ x: 0, y: 0, width: 512, height: 512 });
  });

  it("selectAll respects custom canvas dimensions", () => {
    act(() => {
      useSketchStore.getState().resizeCanvas(1024, 768);
    });
    act(() => {
      useSketchStore.getState().selectAll();
    });
    const sel = useSketchStore.getState().selection;
    expect(sel).toEqual({ x: 0, y: 0, width: 1024, height: 768 });
  });

  it("select tool is a valid tool type", () => {
    act(() => {
      useSketchStore.getState().setActiveTool("select");
    });
    expect(useSketchStore.getState().activeTool).toBe("select");
  });
});
