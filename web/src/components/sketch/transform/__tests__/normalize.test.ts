import {
  normalizeLayerTransform,
  cloneAndValidateTransform,
  assertCanonicalTransform
} from "../normalize";
import { IDENTITY_AFFINE } from "../types";

describe("normalizeLayerTransform", () => {
  describe("null/invalid inputs", () => {
    it("returns identity for null", () => {
      const result = normalizeLayerTransform(null);
      expect(result.kind).toBe("affine");
      expect(result).toEqual(expect.objectContaining({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }));
    });

    it("returns identity for undefined", () => {
      const result = normalizeLayerTransform(undefined);
      expect(result.kind).toBe("affine");
    });

    it("returns identity for non-object (string)", () => {
      const result = normalizeLayerTransform("invalid");
      expect(result.kind).toBe("affine");
    });

    it("returns identity for non-object (number)", () => {
      const result = normalizeLayerTransform(42);
      expect(result.kind).toBe("affine");
    });
  });

  describe("affine transforms", () => {
    it("normalizes a canonical affine transform", () => {
      const input = { kind: "affine", x: 10, y: 20, scaleX: 2, scaleY: 3, rotation: 0.5 };
      const result = normalizeLayerTransform(input);
      expect(result).toEqual({
        kind: "affine",
        x: 10,
        y: 20,
        scaleX: 2,
        scaleY: 3,
        rotation: 0.5
      });
    });

    it("fills in missing TRS fields with defaults", () => {
      const input = { kind: "affine", x: 5 };
      const result = normalizeLayerTransform(input);
      expect(result).toEqual({
        kind: "affine",
        x: 5,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0
      });
    });

    it("falls back to affine for unknown kind", () => {
      const input = { kind: "unknown", x: 7, y: 3 };
      const result = normalizeLayerTransform(input);
      expect(result.kind).toBe("affine");
      if (result.kind === "affine") {
        expect(result.x).toBe(7);
        expect(result.y).toBe(3);
      }
    });

    it("replaces non-finite numbers with defaults", () => {
      const input = { kind: "affine", x: NaN, y: Infinity, scaleX: -Infinity };
      const result = normalizeLayerTransform(input);
      if (result.kind === "affine") {
        expect(result.x).toBe(0);
        expect(result.y).toBe(0);
        expect(result.scaleX).toBe(1);
      }
    });
  });

  describe("quad transforms", () => {
    const validQuad = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ];

    it("normalizes a canonical quad transform", () => {
      const input = { kind: "quad", mode: "distort", quad: validQuad };
      const result = normalizeLayerTransform(input);
      expect(result.kind).toBe("quad");
      if (result.kind === "quad") {
        expect(result.mode).toBe("distort");
        expect(result.quad[0]).toEqual({ x: 0, y: 0 });
        expect(result.quad[2]).toEqual({ x: 100, y: 100 });
      }
    });

    it("accepts perspective mode", () => {
      const input = { kind: "quad", mode: "perspective", quad: validQuad };
      const result = normalizeLayerTransform(input);
      expect(result.kind).toBe("quad");
      if (result.kind === "quad") {
        expect(result.mode).toBe("perspective");
      }
    });

    it("migrates legacy 'warp' mode to 'distort'", () => {
      const input = { kind: "quad", mode: "warp", quad: validQuad };
      const result = normalizeLayerTransform(input);
      expect(result.kind).toBe("quad");
      if (result.kind === "quad") {
        expect(result.mode).toBe("distort");
      }
    });

    it("migrates legacy 'perspective-distort' mode to 'perspective'", () => {
      const input = { kind: "quad", mode: "perspective-distort", quad: validQuad };
      const result = normalizeLayerTransform(input);
      expect(result.kind).toBe("quad");
      if (result.kind === "quad") {
        expect(result.mode).toBe("perspective");
      }
    });

    it("migrates legacy dual-quad to single perspective", () => {
      const input = { kind: "dual-quad", mode: "perspective-dual", quad: validQuad };
      const result = normalizeLayerTransform(input);
      expect(result.kind).toBe("quad");
      if (result.kind === "quad") {
        expect(result.mode).toBe("perspective");
      }
    });

    it("falls back to affine when quad is invalid", () => {
      const input = { kind: "quad", mode: "distort", quad: "not-a-quad" };
      const result = normalizeLayerTransform(input);
      expect(result.kind).toBe("affine");
    });

    it("falls back to affine when quad has wrong number of points", () => {
      const input = { kind: "quad", mode: "distort", quad: [{ x: 0, y: 0 }] };
      const result = normalizeLayerTransform(input);
      expect(result.kind).toBe("affine");
    });

    it("handles modeless quad with valid mode string", () => {
      const input = { mode: "skew", quad: validQuad };
      const result = normalizeLayerTransform(input);
      expect(result.kind).toBe("quad");
      if (result.kind === "quad") {
        expect(result.mode).toBe("skew");
      }
    });
  });
});

describe("cloneAndValidateTransform", () => {
  it("clones an affine transform", () => {
    const original = { ...IDENTITY_AFFINE, x: 50 };
    const cloned = cloneAndValidateTransform(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });

  it("clones a quad transform", () => {
    const original = normalizeLayerTransform({
      kind: "quad",
      mode: "distort",
      quad: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
      ]
    });
    const cloned = cloneAndValidateTransform(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
  });
});

describe("assertCanonicalTransform", () => {
  it("does not throw for valid affine", () => {
    expect(() => assertCanonicalTransform(IDENTITY_AFFINE)).not.toThrow();
  });

  it("does not throw for valid quad", () => {
    const quad = normalizeLayerTransform({
      kind: "quad",
      mode: "perspective",
      quad: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 }
      ]
    });
    expect(() => assertCanonicalTransform(quad)).not.toThrow();
  });

  it("throws for null", () => {
    expect(() => assertCanonicalTransform(null)).toThrow();
  });

  it("throws for unknown kind", () => {
    expect(() => assertCanonicalTransform({ kind: "other" })).toThrow();
  });

  it("throws for missing kind", () => {
    expect(() => assertCanonicalTransform({ x: 0, y: 0 })).toThrow();
  });
});
