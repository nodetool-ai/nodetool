import { describe, it, expect } from "vitest";
import {
  BLEND_MODE_INFOS,
  BLEND_MODES,
  BLEND_MODE_VALUES,
  blendModeGpuId,
  blendModeToCanvasOp,
  blendModeToSharpBlend,
  coerceBlendMode
} from "../src/index.js";

describe("blend-mode catalog", () => {
  it("assigns unique, contiguous gpu ids in display order", () => {
    const ids = BLEND_MODE_INFOS.map((m) => m.gpuId);
    expect(ids).toEqual(ids.map((_, i) => i));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the historical sketch-shader numbering for the first twelve modes", () => {
    expect(blendModeGpuId("normal")).toBe(0);
    expect(blendModeGpuId("multiply")).toBe(1);
    expect(blendModeGpuId("screen")).toBe(2);
    expect(blendModeGpuId("overlay")).toBe(3);
    expect(blendModeGpuId("exclusion")).toBe(11);
    expect(blendModeGpuId("add")).toBe(12);
  });

  it("exposes a UI list aligned with the value list", () => {
    expect(BLEND_MODES.map((m) => m.value)).toEqual([...BLEND_MODE_VALUES]);
    expect(BLEND_MODES[0]).toEqual({ value: "normal", label: "Normal" });
  });
});

describe("coerceBlendMode", () => {
  it("passes through canonical values", () => {
    expect(coerceBlendMode("multiply")).toBe("multiply");
    expect(coerceBlendMode("add")).toBe("add");
  });

  it("maps the legacy 'over' alias to 'normal'", () => {
    expect(coerceBlendMode("over")).toBe("normal");
  });

  it("falls back to 'normal' for garbage", () => {
    expect(coerceBlendMode("data:image/png;base64,AAAA")).toBe("normal");
    expect(coerceBlendMode(undefined)).toBe("normal");
    expect(coerceBlendMode(42)).toBe("normal");
  });
});

describe("platform mappings", () => {
  it("maps to Canvas2D composite operations", () => {
    expect(blendModeToCanvasOp("normal")).toBe("source-over");
    expect(blendModeToCanvasOp("add")).toBe("lighter");
    expect(blendModeToCanvasOp("multiply")).toBe("multiply");
  });

  it("maps to Sharp/libvips blend strings, including the 'over' round-trip", () => {
    expect(blendModeToSharpBlend("normal")).toBe("over");
    expect(blendModeToSharpBlend("over")).toBe("over");
    expect(blendModeToSharpBlend("add")).toBe("add");
    expect(blendModeToSharpBlend("color-dodge")).toBe("color-dodge");
  });
});
