/**
 * @jest-environment node
 */
import {
  pressureMinScaleFromSliderUnit,
  pressureMinScaleToSliderUnit,
  createStrokeAssistPreset,
  resolveStrokeAssistSettings,
  normalizeSegmentBackend,
  editActionKindForTool,
  isShapeTool,
  isPaintingTool,
  isTransformOnlyTool,
  isPixelEditTool,
  cloneDefaultToolSettings,
  mergePenPressureIntoBrush,
  mergePenPressureIntoPencil,
  DEFAULT_BRUSH_SETTINGS,
  DEFAULT_PENCIL_SETTINGS,
  DEFAULT_PEN_PRESSURE,
  type SketchTool
} from "../tools";

describe("pressureMinScaleFromSliderUnit / pressureMinScaleToSliderUnit", () => {
  it("maps 0 to the minimum scale", () => {
    const min = pressureMinScaleFromSliderUnit(0);
    expect(min).toBeCloseTo(0.02, 2);
  });

  it("maps 1 to the maximum scale", () => {
    const max = pressureMinScaleFromSliderUnit(1);
    expect(max).toBeCloseTo(0.55, 2);
  });

  it("clamps below 0", () => {
    expect(pressureMinScaleFromSliderUnit(-0.5)).toBeCloseTo(
      pressureMinScaleFromSliderUnit(0),
      5
    );
  });

  it("clamps above 1", () => {
    expect(pressureMinScaleFromSliderUnit(1.5)).toBeCloseTo(
      pressureMinScaleFromSliderUnit(1),
      5
    );
  });

  it("round-trips at boundaries", () => {
    expect(pressureMinScaleToSliderUnit(pressureMinScaleFromSliderUnit(0))).toBeCloseTo(0, 2);
    expect(pressureMinScaleToSliderUnit(pressureMinScaleFromSliderUnit(1))).toBeCloseTo(1, 2);
  });

  it("round-trips at midpoint", () => {
    const mid = pressureMinScaleFromSliderUnit(0.5);
    expect(pressureMinScaleToSliderUnit(mid)).toBeCloseTo(0.5, 1);
  });
});

describe("createStrokeAssistPreset", () => {
  it("creates smooth preset", () => {
    const settings = createStrokeAssistPreset("smooth");
    expect(settings.preset).toBe("smooth");
    expect(settings.mode).toBe("stabilizer");
    expect(settings.strength).toBeGreaterThan(0);
    expect(settings.snapMode).toBe("off");
  });

  it("creates lazy preset", () => {
    const settings = createStrokeAssistPreset("lazy");
    expect(settings.preset).toBe("lazy");
    expect(settings.mode).toBe("lazy");
    expect(settings.strength).toBeGreaterThan(0);
  });

  it("creates inking preset with angle snap", () => {
    const settings = createStrokeAssistPreset("inking");
    expect(settings.preset).toBe("inking");
    expect(settings.snapMode).toBe("angle");
    expect(settings.snapStrength).toBeGreaterThan(0);
  });
});

describe("resolveStrokeAssistSettings", () => {
  it("returns defaults when both args are undefined", () => {
    const result = resolveStrokeAssistSettings(undefined, undefined);
    expect(result.preset).toBe("custom");
    expect(result.mode).toBe("stabilizer");
    expect(result.strength).toBe(0);
    expect(result.snapMode).toBe("off");
  });

  it("migrates legacy stabilizer value", () => {
    const result = resolveStrokeAssistSettings(0.7, undefined);
    expect(result.strength).toBe(0.7);
    expect(result.mode).toBe("stabilizer");
  });

  it("applies a preset base when preset is specified", () => {
    const result = resolveStrokeAssistSettings(undefined, { preset: "smooth" });
    expect(result.mode).toBe("stabilizer");
    expect(result.strength).toBeGreaterThan(0);
  });

  it("clamps strength to [0, 1]", () => {
    const result = resolveStrokeAssistSettings(undefined, { strength: 2 });
    expect(result.strength).toBeLessThanOrEqual(1);
  });
});

describe("normalizeSegmentBackend", () => {
  it("passes through 'fal'", () => {
    expect(normalizeSegmentBackend("fal")).toBe("fal");
  });

  it("passes through 'local-sam3'", () => {
    expect(normalizeSegmentBackend("local-sam3")).toBe("local-sam3");
  });

  it("migrates legacy 'node' to 'local-sam3'", () => {
    expect(normalizeSegmentBackend("node")).toBe("local-sam3");
  });

  it("defaults to 'fal' for unknown values", () => {
    expect(normalizeSegmentBackend("unknown")).toBe("fal");
    expect(normalizeSegmentBackend(undefined)).toBe("fal");
    expect(normalizeSegmentBackend(null)).toBe("fal");
    expect(normalizeSegmentBackend(42)).toBe("fal");
  });
});

describe("editActionKindForTool", () => {
  it("classifies move and transform as transform-only", () => {
    expect(editActionKindForTool("move")).toBe("transform-only");
    expect(editActionKindForTool("transform")).toBe("transform-only");
  });

  it("classifies eyedropper, select, crop, segment as none", () => {
    const noneTools: SketchTool[] = ["eyedropper", "select", "crop", "segment"];
    for (const tool of noneTools) {
      expect(editActionKindForTool(tool)).toBe("none");
    }
  });

  it("classifies painting tools as pixel-edit", () => {
    const pixelTools: SketchTool[] = [
      "brush", "pencil", "eraser", "fill", "blur", "clone_stamp", "shape", "gradient", "adjust"
    ];
    for (const tool of pixelTools) {
      expect(editActionKindForTool(tool)).toBe("pixel-edit");
    }
  });
});

describe("isShapeTool", () => {
  it("returns true for shape", () => {
    expect(isShapeTool("shape")).toBe(true);
  });

  it("returns false for other tools", () => {
    expect(isShapeTool("brush")).toBe(false);
    expect(isShapeTool("move")).toBe(false);
  });
});

describe("isPaintingTool", () => {
  it("returns true for painting tools", () => {
    expect(isPaintingTool("brush")).toBe(true);
    expect(isPaintingTool("pencil")).toBe(true);
    expect(isPaintingTool("eraser")).toBe(true);
    expect(isPaintingTool("fill")).toBe(true);
    expect(isPaintingTool("clone_stamp")).toBe(true);
    expect(isPaintingTool("blur")).toBe(true);
  });

  it("returns false for non-painting tools", () => {
    expect(isPaintingTool("move")).toBe(false);
    expect(isPaintingTool("select")).toBe(false);
    expect(isPaintingTool("shape")).toBe(false);
  });
});

describe("isTransformOnlyTool", () => {
  it("returns true for move and transform", () => {
    expect(isTransformOnlyTool("move")).toBe(true);
    expect(isTransformOnlyTool("transform")).toBe(true);
  });

  it("returns false for pixel tools", () => {
    expect(isTransformOnlyTool("brush")).toBe(false);
  });
});

describe("isPixelEditTool", () => {
  it("returns true for pixel-editing tools", () => {
    expect(isPixelEditTool("brush")).toBe(true);
    expect(isPixelEditTool("eraser")).toBe(true);
  });

  it("returns false for non-pixel tools", () => {
    expect(isPixelEditTool("move")).toBe(false);
    expect(isPixelEditTool("eyedropper")).toBe(false);
  });
});

describe("cloneDefaultToolSettings", () => {
  it("returns a fresh copy each time", () => {
    const a = cloneDefaultToolSettings();
    const b = cloneDefaultToolSettings();
    expect(a).not.toBe(b);
    expect(a.brush).not.toBe(b.brush);
  });

  it("has all expected tool sections", () => {
    const settings = cloneDefaultToolSettings();
    expect(settings.brush).toBeDefined();
    expect(settings.pencil).toBeDefined();
    expect(settings.eraser).toBeDefined();
    expect(settings.shape).toBeDefined();
    expect(settings.fill).toBeDefined();
    expect(settings.blur).toBeDefined();
    expect(settings.gradient).toBeDefined();
    expect(settings.cloneStamp).toBeDefined();
    expect(settings.select).toBeDefined();
    expect(settings.segment).toBeDefined();
    expect(settings.move).toBeDefined();
    expect(settings.transform).toBeDefined();
    expect(settings.penPressure).toBeDefined();
  });

  it("deep-copies strokeAssist on brush", () => {
    const a = cloneDefaultToolSettings();
    const b = cloneDefaultToolSettings();
    expect(a.brush.strokeAssist).not.toBe(b.brush.strokeAssist);
  });
});

describe("mergePenPressureIntoBrush", () => {
  it("applies pen pressure settings onto brush", () => {
    const merged = mergePenPressureIntoBrush(DEFAULT_BRUSH_SETTINGS, {
      ...DEFAULT_PEN_PRESSURE,
      pressureSensitivity: true,
      pressureAffects: "both"
    });
    expect(merged.pressureSensitivity).toBe(true);
    expect(merged.pressureAffects).toBe("both");
  });

  it("falls back to defaults when penPressure is undefined", () => {
    const merged = mergePenPressureIntoBrush(DEFAULT_BRUSH_SETTINGS, undefined);
    expect(merged.pressureSensitivity).toBe(DEFAULT_PEN_PRESSURE.pressureSensitivity);
  });
});

describe("mergePenPressureIntoPencil", () => {
  it("applies pen pressure settings onto pencil", () => {
    const merged = mergePenPressureIntoPencil(DEFAULT_PENCIL_SETTINGS, {
      ...DEFAULT_PEN_PRESSURE,
      pressureSensitivity: true
    });
    expect(merged.pressureSensitivity).toBe(true);
  });
});
