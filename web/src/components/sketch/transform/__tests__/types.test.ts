/**
 * @jest-environment node
 */
import {
  isAffineTransform,
  isQuadTransform,
  isSingleQuadTransform,
  isIdentityTransform,
  transformModeTag,
  makeAffineTransform,
  makeSingleQuadTransform,
  cloneQuad,
  cloneTransform,
  IDENTITY_AFFINE,
  type AffineTransform,
  type SingleQuadTransform,
  type Quad,
} from "../types";

const affine: AffineTransform = {
  kind: "affine",
  x: 10,
  y: 20,
  scaleX: 2,
  scaleY: 0.5,
  rotation: Math.PI / 4,
};

const quad: SingleQuadTransform = {
  kind: "quad",
  mode: "distort",
  quad: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
};

describe("type guards", () => {
  it("isAffineTransform returns true for affine", () => {
    expect(isAffineTransform(affine)).toBe(true);
    expect(isAffineTransform(quad)).toBe(false);
  });

  it("isQuadTransform returns true for quad", () => {
    expect(isQuadTransform(quad)).toBe(true);
    expect(isQuadTransform(affine)).toBe(false);
  });

  it("isSingleQuadTransform returns true for quad", () => {
    expect(isSingleQuadTransform(quad)).toBe(true);
    expect(isSingleQuadTransform(affine)).toBe(false);
  });
});

describe("isIdentityTransform", () => {
  it("returns true for IDENTITY_AFFINE", () => {
    expect(isIdentityTransform(IDENTITY_AFFINE)).toBe(true);
  });

  it("returns false when any field differs from identity", () => {
    expect(isIdentityTransform({ ...IDENTITY_AFFINE, x: 1 })).toBe(false);
    expect(isIdentityTransform({ ...IDENTITY_AFFINE, y: 1 })).toBe(false);
    expect(isIdentityTransform({ ...IDENTITY_AFFINE, scaleX: 2 })).toBe(false);
    expect(isIdentityTransform({ ...IDENTITY_AFFINE, scaleY: 2 })).toBe(false);
    expect(isIdentityTransform({ ...IDENTITY_AFFINE, rotation: 0.1 })).toBe(
      false
    );
  });

  it("returns false for quad transforms", () => {
    expect(isIdentityTransform(quad)).toBe(false);
  });
});

describe("transformModeTag", () => {
  it("returns 'affine' for affine transforms", () => {
    expect(transformModeTag(affine)).toBe("affine");
  });

  it("returns the quad mode for quad transforms", () => {
    expect(transformModeTag(quad)).toBe("distort");
    expect(
      transformModeTag({ ...quad, mode: "perspective" })
    ).toBe("perspective");
    expect(transformModeTag({ ...quad, mode: "skew" })).toBe("skew");
    expect(transformModeTag({ ...quad, mode: "mesh-warp" })).toBe("mesh-warp");
  });
});

describe("makeAffineTransform", () => {
  it("returns identity when called with no args", () => {
    const t = makeAffineTransform();
    expect(t).toEqual(IDENTITY_AFFINE);
  });

  it("overrides specified fields", () => {
    const t = makeAffineTransform({ x: 5, scaleX: 3 });
    expect(t.x).toBe(5);
    expect(t.scaleX).toBe(3);
    expect(t.y).toBe(0);
    expect(t.scaleY).toBe(1);
    expect(t.rotation).toBe(0);
    expect(t.kind).toBe("affine");
  });
});

describe("makeSingleQuadTransform", () => {
  it("creates a quad transform with the specified mode and quad", () => {
    const q: Quad = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 0, y: 50 },
    ];
    const t = makeSingleQuadTransform("perspective", q);
    expect(t.kind).toBe("quad");
    expect(t.mode).toBe("perspective");
    expect(t.quad[0]).toEqual({ x: 0, y: 0 });
  });

  it("clones the input quad (does not share references)", () => {
    const q: Quad = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const t = makeSingleQuadTransform("distort", q);
    expect(t.quad).not.toBe(q);
    expect(t.quad[0]).not.toBe(q[0]);
  });
});

describe("cloneQuad", () => {
  it("deep-copies all four points", () => {
    const q: Quad = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 5, y: 6 },
      { x: 7, y: 8 },
    ];
    const c = cloneQuad(q);
    expect(c).toEqual(q);
    expect(c).not.toBe(q);
    expect(c[0]).not.toBe(q[0]);
    expect(c[1]).not.toBe(q[1]);
  });
});

describe("cloneTransform", () => {
  it("clones affine transforms", () => {
    const c = cloneTransform(affine);
    expect(c).toEqual(affine);
    expect(c).not.toBe(affine);
  });

  it("clones quad transforms and deep-copies the quad", () => {
    const c = cloneTransform(quad);
    expect(c).toEqual(quad);
    expect(c).not.toBe(quad);
    if (c.kind === "quad") {
      expect(c.quad).not.toBe(quad.quad);
      expect(c.quad[0]).not.toBe(quad.quad[0]);
    }
  });
});
