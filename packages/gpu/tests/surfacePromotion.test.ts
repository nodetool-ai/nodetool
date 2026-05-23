import { describe, it, expect } from "vitest";
import { createDefaultRegistry } from "../src/pool.js";
import {
  colorGradeV1,
  blurGaussianV1,
  sharpenUnsharpMaskV1,
  vignetteV1,
  chromaKeyV1,
  colorInvertV1,
  colorBrightnessContrastV1,
  colorHsbV1,
  keyerLumaKeyV1,
  maskApplyV1
} from "../src/shaders/index.js";

/**
 * Phase 3 published surface: the five Phase 2 timeline-effect modules plus
 * the high-confidence Batch 1 subset. Once `published`, params cannot be
 * reordered, removed, or retyped — breaking changes ship as a new `version`.
 *
 * This test is the registry-side contract for workflow-load failure modes
 * (Phase 4): if a `published` module disappears, every saved workflow that
 * references it stops loading. Promotion / demotion needs an explicit edit
 * here.
 */
const EXPECTED_PUBLISHED: ReadonlyArray<{ id: string; version: number }> = [
  // Phase 2 timeline-effect batch.
  { id: "color.grade", version: 1 },
  { id: "filters.blur.gaussian", version: 1 },
  { id: "filters.sharpen.unsharpMask", version: 1 },
  { id: "filters.vignette", version: 1 },
  { id: "keyer.chromaKey", version: 1 },
  // Phase 3 Batch 1 high-confidence subset.
  { id: "color.invert", version: 1 },
  { id: "color.brightnessContrast", version: 1 },
  { id: "color.hsb", version: 1 },
  { id: "keyer.lumaKey", version: 1 },
  { id: "mask.apply", version: 1 }
];

describe("Phase 3 published surface", () => {
  it("publishes the Phase 2 timeline-effect batch", () => {
    expect(colorGradeV1.surface).toBe("published");
    expect(blurGaussianV1.surface).toBe("published");
    expect(sharpenUnsharpMaskV1.surface).toBe("published");
    expect(vignetteV1.surface).toBe("published");
    expect(chromaKeyV1.surface).toBe("published");
  });

  it("publishes the Phase 3 Batch 1 high-confidence subset", () => {
    expect(colorInvertV1.surface).toBe("published");
    expect(colorBrightnessContrastV1.surface).toBe("published");
    expect(colorHsbV1.surface).toBe("published");
    expect(keyerLumaKeyV1.surface).toBe("published");
    expect(maskApplyV1.surface).toBe("published");
  });

  it("every expected published module resolves through the registry with surface filter", () => {
    const registry = createDefaultRegistry();
    for (const { id, version } of EXPECTED_PUBLISHED) {
      const found = registry.tryGet({ id, version, surface: "published" });
      expect(found, `${id}@${version} should resolve at surface=published`).toBeDefined();
      expect(found?.surface).toBe("published");
    }
  });

  it("list(surface=published) matches the expected set", () => {
    const registry = createDefaultRegistry();
    const published = registry.list({ surface: "published" });
    const seen = new Set(published.map((m) => `${m.id}@${m.version}`));
    const expected = new Set(EXPECTED_PUBLISHED.map((m) => `${m.id}@${m.version}`));
    expect(seen).toEqual(expected);
  });
});
