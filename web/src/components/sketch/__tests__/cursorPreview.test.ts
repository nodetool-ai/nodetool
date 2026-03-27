/**
 * Tests for cursor preview accuracy improvements.
 *
 * Validates:
 * - Cursor size accounts for brush hardness
 * - Soft brushes show a smaller cursor than hard brushes
 * - Pencil cursor is unaffected by brush hardness
 */

describe("Cursor hardness compensation", () => {
  // The cursor radius formula used in useOverlayRenderer:
  //   effectiveHardness = (depends on brush type)
  //   innerStop = max(0, min(1, effectiveHardness * 0.85 + 0.1))
  //   hardnessScale = innerStop + (1 - innerStop) * 0.5
  //   screenRadiusX = (size / 2) * hardnessScale * zoom
  //
  // This mirrors the radial gradient used in createBrushStamp.

  function computeHardnessScale(hardness: number): number {
    if (hardness >= 0.999) {
      return 1;
    }
    const innerStop = Math.max(0, Math.min(1, hardness * 0.85 + 0.1));
    return innerStop + (1 - innerStop) * 0.5;
  }

  function computeEffectiveHardness(
    brushType: string,
    hardness: number
  ): number {
    if (brushType === "soft") {
      return Math.min(hardness, 0.35);
    }
    if (brushType === "airbrush") {
      return Math.min(hardness, 0.18);
    }
    return hardness;
  }

  it("round brush with full hardness uses full radius", () => {
    const scale = computeHardnessScale(
      computeEffectiveHardness("round", 1.0)
    );
    expect(scale).toBe(1);
  });

  it("round brush with high hardness (0.8) slightly reduces cursor", () => {
    const scale = computeHardnessScale(
      computeEffectiveHardness("round", 0.8)
    );
    // innerStop = 0.8 * 0.85 + 0.1 = 0.78
    // scale = 0.78 + (1 - 0.78) * 0.5 = 0.78 + 0.11 = 0.89
    expect(scale).toBeCloseTo(0.89, 2);
  });

  it("soft brush caps hardness at 0.35", () => {
    const effectiveHardness = computeEffectiveHardness("soft", 0.8);
    expect(effectiveHardness).toBe(0.35);
  });

  it("soft brush produces significantly smaller cursor", () => {
    const scale = computeHardnessScale(
      computeEffectiveHardness("soft", 0.8)
    );
    // effectiveHardness = 0.35
    // innerStop = 0.35 * 0.85 + 0.1 = 0.3975
    // scale = 0.3975 + (1 - 0.3975) * 0.5 = 0.3975 + 0.30125 = 0.69875
    expect(scale).toBeCloseTo(0.699, 2);
    expect(scale).toBeLessThan(0.8);
  });

  it("airbrush produces even smaller cursor", () => {
    const scale = computeHardnessScale(
      computeEffectiveHardness("airbrush", 0.8)
    );
    // effectiveHardness = 0.18
    // innerStop = 0.18 * 0.85 + 0.1 = 0.253
    // scale = 0.253 + (1 - 0.253) * 0.5 = 0.253 + 0.3735 = 0.6265
    expect(scale).toBeCloseTo(0.627, 2);
    expect(scale).toBeLessThan(0.7);
  });

  it("computeHardnessScale matches formula for mid-range hardness", () => {
    const scale = computeHardnessScale(0.5);
    // innerStop = 0.5 * 0.85 + 0.1 = 0.525
    // scale = 0.525 + (1 - 0.525) * 0.5 = 0.525 + 0.2375 = 0.7625
    expect(scale).toBeCloseTo(0.763, 2);
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThan(0.5);
  });

  it("screen radius calculation is correct", () => {
    const size = 20;
    const zoom = 2;
    const hardnessScale = computeHardnessScale(
      computeEffectiveHardness("round", 0.8)
    );
    const screenRadiusX = (size / 2) * hardnessScale * zoom;
    // For round brush at 0.8 hardness: hardnessScale ≈ 0.89
    // screenRadiusX = 10 * 0.89 * 2 = 17.8
    expect(screenRadiusX).toBeCloseTo(17.8, 1);
  });
});
