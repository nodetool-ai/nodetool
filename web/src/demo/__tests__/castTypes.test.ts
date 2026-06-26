import { isDemoCast, CAST_VERSION, CAST_ASSET_SCHEME } from "../castTypes";

describe("castTypes", () => {
  describe("CAST_ASSET_SCHEME", () => {
    it("is a URI scheme string", () => {
      expect(CAST_ASSET_SCHEME).toBe("cast-asset://");
    });
  });

  describe("isDemoCast", () => {
    const validCast = {
      version: CAST_VERSION,
      id: "demo-1",
      name: "Demo",
      durationMs: 5000,
      workflow: { id: "wf-1", nodes: [] },
      metadata: { "nodetool.image.TextToImage": {} },
      events: [],
      assets: [],
    };

    it("returns true for a valid cast object", () => {
      expect(isDemoCast(validCast)).toBe(true);
    });

    it("returns true with optional fields present", () => {
      expect(
        isDemoCast({
          ...validCast,
          description: "A test cast",
          fps: 30,
          createdAt: "2025-01-01T00:00:00Z",
          viewport: { x: 0, y: 0, zoom: 1 },
        })
      ).toBe(true);
    });

    it("returns false for null", () => {
      expect(isDemoCast(null)).toBe(false);
    });

    it("returns false for non-objects", () => {
      expect(isDemoCast("string")).toBe(false);
      expect(isDemoCast(42)).toBe(false);
      expect(isDemoCast(undefined)).toBe(false);
    });

    it("returns false for wrong version", () => {
      expect(isDemoCast({ ...validCast, version: 999 })).toBe(false);
    });

    it("returns false when id is not a string", () => {
      expect(isDemoCast({ ...validCast, id: 123 })).toBe(false);
    });

    it("returns false when workflow is null", () => {
      expect(isDemoCast({ ...validCast, workflow: null })).toBe(false);
    });

    it("returns false when workflow is not an object", () => {
      expect(isDemoCast({ ...validCast, workflow: "not-object" })).toBe(
        false
      );
    });

    it("returns false when events is not an array", () => {
      expect(isDemoCast({ ...validCast, events: "not-array" })).toBe(false);
    });

    it("returns false when assets is not an array", () => {
      expect(isDemoCast({ ...validCast, assets: {} })).toBe(false);
    });

    it("returns false when metadata is null", () => {
      expect(isDemoCast({ ...validCast, metadata: null })).toBe(false);
    });

    it("returns false when metadata is not an object", () => {
      expect(isDemoCast({ ...validCast, metadata: "string" })).toBe(false);
    });
  });
});
