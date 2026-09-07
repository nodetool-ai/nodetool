import { parseSvgPath } from "@nodetool-ai/timeline/scene";
import { shapeClipToFollowPathParams } from "../followPathParams";

describe("shapeClipToFollowPathParams", () => {
  it("returns null for an undefined shape style", () => {
    expect(shapeClipToFollowPathParams(undefined)).toBeNull();
  });

  it("synthesizes a unit-square d for a rect, using the style's box", () => {
    const result = shapeClipToFollowPathParams({
      kind: "rect",
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.4
    });
    expect(result).not.toBeNull();
    expect(result).toEqual({
      d: expect.any(String),
      pathX: 0.1,
      pathY: 0.2,
      pathWidth: 0.3,
      pathHeight: 0.4
    });
    expect(parseSvgPath(result!.d)).toEqual({ ok: true, segments: expect.any(Array) });
  });

  it("falls back to shapeGeometry's default box when fields are absent", () => {
    const result = shapeClipToFollowPathParams({ kind: "rect" });
    expect(result).toEqual(
      expect.objectContaining({ pathX: 0.25, pathY: 0.25, pathWidth: 0.5, pathHeight: 0.5 })
    );
  });

  it("synthesizes a parseable four-cubic ellipse d", () => {
    const result = shapeClipToFollowPathParams({
      kind: "ellipse",
      x: 0,
      y: 0,
      width: 1,
      height: 1
    });
    expect(result).not.toBeNull();
    const parsed = parseSvgPath(result!.d);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      // move + 4 cubics + close
      expect(parsed.segments).toHaveLength(6);
      expect(parsed.segments[0]).toEqual({ kind: "move", x: 1, y: 0.5 });
      expect(parsed.segments[parsed.segments.length - 1]).toEqual({ kind: "close" });
    }
  });

  it("uses an authored path clip's own d", () => {
    const result = shapeClipToFollowPathParams({
      kind: "path",
      d: "M0 0L1 1Z",
      x: 0,
      y: 0,
      width: 1,
      height: 1
    });
    expect(result?.d).toBe("M0 0L1 1Z");
  });

  it("returns null for a path clip with an empty d", () => {
    expect(shapeClipToFollowPathParams({ kind: "path", d: "  " })).toBeNull();
  });

  it("returns null for shapes with no single closed outline", () => {
    expect(shapeClipToFollowPathParams({ kind: "line" })).toBeNull();
    expect(shapeClipToFollowPathParams({ kind: "polygon" })).toBeNull();
    expect(shapeClipToFollowPathParams({ kind: "star" })).toBeNull();
  });
});
